import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { GtdError } from './core.ts';
import { ensureTagIds, parseTagNames } from './organize.ts';
import { type ViewFilter, NO_FILTER, getItem } from './items.ts';

export const PROJECT_STATES = ['active', 'later', 'scheduled', 'someday'] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

export type Project = {
	id: number;
	name: string;
	desiredOutcome: string;
	notes: string;
	state: string;
	areaId: number | null;
	startsAt: number | null;
	dueAt: number | null;
	completedAt: number | null;
	tags: string[];
	openCount: number;
	executionMode: 'parallel' | 'sequential';
	// Ativo sem nenhuma ação disponível em Próximas.
	stalled: boolean;
};

export type ProjectInput = {
	name?: unknown;
	desiredOutcome?: unknown;
	notes?: unknown;
	state?: unknown;
	areaId?: number | null;
	startsAt?: number | null;
	dueAt?: number | null;
	tags?: unknown;
	executionMode?: unknown;
};

const SELECT = `
	SELECT p.*,
		(SELECT group_concat(t.name, char(31)) FROM project_tags pt JOIN tags t ON t.id = pt.tag_id
			WHERE pt.project_id = p.id) AS tag_names,
		(SELECT COUNT(*) FROM items i WHERE i.project_id = p.id
			AND i.state NOT IN ('completed', 'trash')) AS open_count,
		(SELECT COUNT(*) FROM items i WHERE i.project_id = p.id AND i.kind = 'task'
			AND i.state = 'next') AS next_count
	FROM projects p`;

function num(v: unknown): number | null {
	return v == null ? null : Number(v);
}

function map(r: Record<string, unknown>): Project {
	return {
		id: Number(r.id),
		name: String(r.name),
		desiredOutcome: String(r.desired_outcome),
		notes: String(r.notes),
		state: String(r.state),
		areaId: num(r.area_id),
		startsAt: num(r.starts_at),
		dueAt: num(r.due_at),
		completedAt: num(r.completed_at),
		tags: r.tag_names ? String(r.tag_names).split('\x1f').sort() : [],
		openCount: Number(r.open_count),
		executionMode: r.execution_mode === 'sequential' ? 'sequential' : 'parallel',
		stalled: r.state === 'active' && Number(r.next_count) === 0
	};
}

export function getProject(db: DatabaseSync, id: number): Project {
	const r = db.prepare(`${SELECT} WHERE p.id = ?`).get(id);
	if (!r) throw new GtdError('projeto não encontrado', 404);
	return map(r);
}

function resolveState(state: string, startsAt: number | null, today: number): ProjectState {
	if (!(PROJECT_STATES as readonly string[]).includes(state)) throw new GtdError('estado inválido');
	if (state === 'scheduled') {
		if (startsAt == null) throw new GtdError('informe a data de início para agendar');
		return startsAt <= today ? 'active' : 'scheduled';
	}
	return state as ProjectState;
}

function cleanMode(v: unknown, fallback: Project['executionMode']): Project['executionMode'] {
	if (v == null || v === '') return fallback;
	if (v !== 'parallel' && v !== 'sequential') throw new GtdError('modo de execução inválido');
	return v;
}

function setTags(db: DatabaseSync, id: number, tags: unknown) {
	db.prepare('DELETE FROM project_tags WHERE project_id = ?').run(id);
	for (const t of ensureTagIds(db, parseTagNames(tags))) {
		db.prepare('INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)').run(id, t);
	}
}

export function createProject(db: DatabaseSync, input: ProjectInput, today: number): number {
	const name = String(input.name ?? '').trim();
	if (!name) throw new GtdError('informe o nome do projeto');
	const startsAt = input.startsAt ?? null;
	const state = resolveState(String(input.state ?? 'active'), startsAt, today);
	const now = Date.now();
	const pos = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM projects').get();
	const id = Number(
		db
			.prepare(
				`INSERT INTO projects (name, desired_outcome, notes, state, area_id, starts_at, due_at,
					execution_mode, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				name,
				String(input.desiredOutcome ?? ''),
				String(input.notes ?? ''),
				state,
				input.areaId ?? null,
				startsAt,
				input.dueAt ?? null,
				cleanMode(input.executionMode, 'parallel'),
				Number(pos?.p ?? 0),
				now,
				now
			).lastInsertRowid
	);
	if (input.tags) setTags(db, id, input.tags);
	return id;
}

export function updateProject(
	db: DatabaseSync,
	id: number,
	input: ProjectInput,
	today: number
): void {
	const cur = getProject(db, id);
	if (cur.state === 'completed' || cur.state === 'trash') {
		throw new GtdError('restaure o projeto antes de editar');
	}
	const name = String(input.name ?? cur.name).trim();
	if (!name) throw new GtdError('informe o nome do projeto');
	const startsAt = input.startsAt === undefined ? cur.startsAt : input.startsAt;
	const state = resolveState(String(input.state ?? cur.state), startsAt, today);
	db.prepare(
		`UPDATE projects SET name = ?, desired_outcome = ?, notes = ?, state = ?, area_id = ?,
			starts_at = ?, due_at = ?, execution_mode = ?, updated_at = ? WHERE id = ?`
	).run(
		name,
		String(input.desiredOutcome ?? cur.desiredOutcome),
		String(input.notes ?? cur.notes),
		state,
		input.areaId === undefined ? cur.areaId : input.areaId,
		startsAt,
		input.dueAt === undefined ? cur.dueAt : input.dueAt,
		cleanMode(input.executionMode, cur.executionMode),
		Date.now(),
		id
	);
	if (input.tags !== undefined) setTags(db, id, input.tags);
}

export function listProjects(
	db: DatabaseSync,
	states: readonly string[] = ['active'],
	filter: ViewFilter = NO_FILTER
): Project[] {
	const params: SQLInputValue[] = [...states];
	let where = `p.state IN (${states.map(() => '?').join(',')})`;
	if (filter.area === 'none') where += ' AND p.area_id IS NULL';
	else if (filter.area != null) {
		where += ' AND p.area_id = ?';
		params.push(filter.area);
	}
	if (filter.tagId != null) {
		where += ' AND EXISTS (SELECT 1 FROM project_tags x WHERE x.project_id = p.id AND x.tag_id = ?)';
		params.push(filter.tagId);
	}
	return db
		.prepare(`${SELECT} WHERE ${where} ORDER BY p.position, p.id`)
		.all(...params)
		.map(map);
}

export function completeProject(db: DatabaseSync, id: number): void {
	const now = Date.now();
	getProject(db, id);
	db.prepare("UPDATE projects SET state = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
}

export function reopenProject(db: DatabaseSync, id: number): void {
	if (getProject(db, id).state !== 'completed') return;
	db.prepare(
		"UPDATE projects SET state = 'active', completed_at = NULL, updated_at = ? WHERE id = ?"
	).run(Date.now(), id);
}

export function activateScheduledProjects(db: DatabaseSync, today: number): void {
	db.prepare(
		`UPDATE projects SET state = 'active', updated_at = ?
		WHERE state = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= ?`
	).run(Date.now(), today);
}

// Transforma uma ação em projeto: o título vira o nome e a ação sai da lista.
export function projectFromItem(db: DatabaseSync, itemId: number, today: number): number {
	const item = getItem(db, itemId);
	db.exec('BEGIN;');
	try {
		const id = createProject(
			db,
			{ name: item.title, notes: item.notes, areaId: item.areaId, tags: item.tags.join(',') },
			today
		);
		db.prepare("UPDATE items SET state = 'trash', previous_state = ?, updated_at = ? WHERE id = ?").run(
			item.state === 'trash' || item.state === 'completed' ? 'inbox' : item.state,
			Date.now(),
			itemId
		);
		db.exec('COMMIT;');
		return id;
	} catch (e) {
		db.exec('ROLLBACK;');
		throw e;
	}
}
