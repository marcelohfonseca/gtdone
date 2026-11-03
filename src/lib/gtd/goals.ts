import type { DatabaseSync } from 'node:sqlite';
import { GtdError } from './core.ts';

export const GOAL_STATUSES = ['active', 'achieved', 'archived'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export type Goal = {
	id: number;
	name: string;
	description: string;
	status: GoalStatus;
	dueAt: number | null;
	areaId: number | null;
	completedAt: number | null;
	linkCount: number;
	// Vínculos já concluídos (ações concluídas e projetos concluídos).
	doneCount: number;
};

export type GoalLinks = {
	items: { id: number; title: string; state: string; kind: string }[];
	projects: { id: number; name: string; state: string }[];
};

export type GoalInput = { name?: unknown; description?: unknown; dueAt?: number | null; status?: unknown; areaId?: number | null };

const SELECT = `
	SELECT g.*,
		(SELECT COUNT(*) FROM goal_links l WHERE l.goal_id = g.id) AS link_count,
		(SELECT COUNT(*) FROM goal_links l LEFT JOIN items i ON i.id = l.item_id
			LEFT JOIN projects p ON p.id = l.project_id
			WHERE l.goal_id = g.id AND (i.state = 'completed' OR p.state = 'completed')) AS done_count
	FROM goals g`;

function map(r: Record<string, unknown>): Goal {
	return {
		id: Number(r.id),
		name: String(r.name),
		description: String(r.description),
		status: String(r.status) as GoalStatus,
		dueAt: r.due_at == null ? null : Number(r.due_at),
		areaId: r.area_id == null ? null : Number(r.area_id),
		completedAt: r.completed_at == null ? null : Number(r.completed_at),
		linkCount: Number(r.link_count),
		doneCount: Number(r.done_count)
	};
}

function cleanName(v: unknown): string {
	const n = String(v ?? '').trim();
	if (!n) throw new GtdError('informe um nome');
	if (n.length > 200) throw new GtdError('nome muito longo');
	return n;
}

export function listGoals(db: DatabaseSync, statuses: GoalStatus[] = ['active']): Goal[] {
	const marks = statuses.map(() => '?').join(',');
	return db
		.prepare(`${SELECT} WHERE g.status IN (${marks}) ORDER BY g.due_at IS NULL, g.due_at, g.name COLLATE NOCASE`)
		.all(...statuses)
		.map(map);
}

export function getGoal(db: DatabaseSync, id: number): Goal {
	const r = db.prepare(`${SELECT} WHERE g.id = ?`).get(id);
	if (!r) throw new GtdError('objetivo não encontrado', 404);
	return map(r);
}

export function createGoal(db: DatabaseSync, input: GoalInput): number {
	const now = Date.now();
	return Number(
		db
			.prepare(
				'INSERT INTO goals (name, description, due_at, area_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run(cleanName(input.name), String(input.description ?? '').trim(), input.dueAt ?? null, input.areaId ?? null, now, now)
			.lastInsertRowid
	);
}

export function updateGoal(db: DatabaseSync, id: number, input: GoalInput): void {
	const cur = getGoal(db, id);
	const status = input.status === undefined ? cur.status : String(input.status);
	if (!(GOAL_STATUSES as readonly string[]).includes(status)) throw new GtdError('estado inválido');
	const now = Date.now();
	db.prepare(
		`UPDATE goals SET name = ?, description = ?, due_at = ?, area_id = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ?`
	).run(
		input.name === undefined ? cur.name : cleanName(input.name),
		input.description === undefined ? cur.description : String(input.description).trim(),
		input.dueAt === undefined ? cur.dueAt : input.dueAt,
		input.areaId === undefined ? cur.areaId : input.areaId,
		status,
		status === 'achieved' ? (cur.completedAt ?? now) : null,
		now,
		id
	);
}

export function deleteGoal(db: DatabaseSync, id: number): void {
	getGoal(db, id);
	db.prepare('DELETE FROM goals WHERE id = ?').run(id);
}

export type LinkTarget = { itemId: number } | { projectId: number };

function assertTarget(db: DatabaseSync, target: LinkTarget) {
	const found =
		'itemId' in target
			? db.prepare('SELECT 1 FROM items WHERE id = ?').get(target.itemId)
			: db.prepare('SELECT 1 FROM projects WHERE id = ?').get(target.projectId);
	if (!found) throw new GtdError('destino do vínculo não encontrado', 404);
}

export function linkGoal(db: DatabaseSync, goalId: number, target: LinkTarget): void {
	getGoal(db, goalId);
	assertTarget(db, target);
	db.prepare(
		'INSERT OR IGNORE INTO goal_links (goal_id, item_id, project_id, created_at) VALUES (?, ?, ?, ?)'
	).run(
		goalId,
		'itemId' in target ? target.itemId : null,
		'projectId' in target ? target.projectId : null,
		Date.now()
	);
}

export function unlinkGoal(db: DatabaseSync, goalId: number, target: LinkTarget): void {
	if ('itemId' in target) {
		db.prepare('DELETE FROM goal_links WHERE goal_id = ? AND item_id = ?').run(goalId, target.itemId);
	} else {
		db.prepare('DELETE FROM goal_links WHERE goal_id = ? AND project_id = ?').run(goalId, target.projectId);
	}
}

// Substitui o conjunto de objetivos de uma ação ou projeto.
export function setGoalsFor(db: DatabaseSync, target: LinkTarget, goalIds: number[]): void {
	assertTarget(db, target);
	const wanted = new Set(goalIds);
	for (const gid of wanted) getGoal(db, gid);
	const col = 'itemId' in target ? 'item_id' : 'project_id';
	const id = 'itemId' in target ? target.itemId : target.projectId;
	const current = db
		.prepare(`SELECT goal_id FROM goal_links WHERE ${col} = ?`)
		.all(id)
		.map((r) => Number(r.goal_id));
	for (const gid of current) if (!wanted.has(gid)) unlinkGoal(db, gid, target);
	for (const gid of wanted) if (!current.includes(gid)) linkGoal(db, gid, target);
}

export function goalLinks(db: DatabaseSync, goalId: number): GoalLinks {
	return {
		items: db
			.prepare(
				`SELECT i.id, i.title, i.state, i.kind FROM goal_links l JOIN items i ON i.id = l.item_id
				WHERE l.goal_id = ? AND i.state != 'trash' ORDER BY i.state = 'completed', i.title COLLATE NOCASE`
			)
			.all(goalId)
			.map((r) => ({ id: Number(r.id), title: String(r.title), state: String(r.state), kind: String(r.kind) })),
		projects: db
			.prepare(
				`SELECT p.id, p.name, p.state FROM goal_links l JOIN projects p ON p.id = l.project_id
				WHERE l.goal_id = ? AND p.state != 'trash' ORDER BY p.state = 'completed', p.name COLLATE NOCASE`
			)
			.all(goalId)
			.map((r) => ({ id: Number(r.id), name: String(r.name), state: String(r.state) }))
	};
}

// Mapa reverso usado pelos editores: id da ação/projeto → ids dos objetivos.
export function goalIdsByTarget(db: DatabaseSync): { items: Record<number, number[]>; projects: Record<number, number[]> } {
	const out = { items: {} as Record<number, number[]>, projects: {} as Record<number, number[]> };
	for (const r of db.prepare('SELECT goal_id, item_id, project_id FROM goal_links').all()) {
		const bucket = r.item_id != null ? out.items : out.projects;
		const key = Number(r.item_id ?? r.project_id);
		(bucket[key] ??= []).push(Number(r.goal_id));
	}
	return out;
}
