import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import {
	GtdError,
	startOfTodayUtc,
	parseRecurrence,
	advanceDate,
	isStateList,
	type ListName,
	type StateList,
	STATE_LISTS
} from './core.ts';
import { ensureTagIds, parseTagNames } from './organize.ts';

export type ViewFilter = {
	area: number | 'none' | null;
	tagId: number | null;
	energy?: 'low' | 'medium' | 'high' | null;
	// Tempo disponível: itens sem estimativa continuam visíveis.
	maxMinutes?: number | null;
	contactId?: number | null;
	projectId?: number | null;
	due?: 'overdue' | 'week' | null;
	sort?: 'due' | null;
	// Preferências: itens sem área continuam visíveis sob um filtro de área; início da semana.
	includeUnassigned?: boolean;
	weekStart?: 0 | 1;
};
export const NO_FILTER: ViewFilter = { area: null, tagId: null };

export type Item = {
	id: number;
	kind: 'task' | 'reference';
	title: string;
	notes: string;
	state: string;
	previousState: string | null;
	dueAt: number | null;
	startsAt: number | null;
	energy: 'low' | 'medium' | 'high' | null;
	minutes: number | null;
	starred: boolean;
	projectId: number | null;
	projectName: string | null;
	areaId: number | null;
	contactId: number | null;
	contactName: string | null;
	position: number;
	completedAt: number | null;
	tags: string[];
	recurrence: string | null;
	checklist: ChecklistEntry[];
};

export type ItemInput = {
	title?: unknown;
	notes?: unknown;
	state?: unknown;
	dueAt?: number | null;
	startsAt?: number | null;
	energy?: unknown;
	minutes?: unknown;
	starred?: boolean;
	projectId?: number | null;
	areaId?: number | null;
	contactId?: number | null;
	tags?: unknown;
	recurrence?: unknown;
	kind?: 'task' | 'reference';
};

const SELECT = `
	SELECT i.*, p.name AS project_name, c.name AS contact_name,
		(SELECT group_concat(t.name, char(31)) FROM item_tags it JOIN tags t ON t.id = it.tag_id
			WHERE it.item_id = i.id) AS tag_names,
		(SELECT rule FROM recurrences r WHERE r.item_id = i.id) AS recurrence,
		(SELECT json_group_array(json_object('id', ci.id, 'title', ci.title, 'done', ci.done))
			FROM (SELECT * FROM checklist_items WHERE item_id = i.id ORDER BY position, id) ci) AS checklist_json
	FROM items i
	LEFT JOIN projects p ON p.id = i.project_id
	LEFT JOIN contacts c ON c.id = i.delegated_to_id`;

function numOrNull(v: unknown): number | null {
	return v == null ? null : Number(v);
}

function mapItem(r: Record<string, unknown>): Item {
	return {
		id: Number(r.id),
		kind: r.kind as Item['kind'],
		title: String(r.title),
		notes: String(r.notes),
		state: String(r.state),
		previousState: r.previous_state == null ? null : String(r.previous_state),
		dueAt: numOrNull(r.due_at),
		startsAt: numOrNull(r.starts_at),
		energy: (r.energy as Item['energy']) ?? null,
		minutes: numOrNull(r.minutes),
		starred: Number(r.starred) === 1,
		projectId: numOrNull(r.project_id),
		projectName: r.project_name == null ? null : String(r.project_name),
		areaId: numOrNull(r.area_id),
		contactId: numOrNull(r.delegated_to_id),
		contactName: r.contact_name == null ? null : String(r.contact_name),
		position: Number(r.position),
		completedAt: numOrNull(r.completed_at),
		tags: r.tag_names ? String(r.tag_names).split('\x1f').sort() : [],
		recurrence: r.recurrence == null ? null : String(r.recurrence),
		checklist: (JSON.parse(String(r.checklist_json ?? '[]')) as { id: number; title: string; done: number }[]).map(
			(c) => ({ id: c.id, title: c.title, done: c.done === 1 })
		)
	};
}

export function getItem(db: DatabaseSync, id: number): Item {
	const row = db.prepare(`${SELECT} WHERE i.id = ?`).get(id);
	if (!row) throw new GtdError('item não encontrado', 404);
	return mapItem(row);
}

function cleanTitle(v: unknown): string {
	const t = String(v ?? '').trim();
	if (!t) throw new GtdError('informe um título');
	return t;
}

function cleanEnergy(v: unknown): Item['energy'] {
	const e = String(v ?? '');
	if (!e) return null;
	if (e !== 'low' && e !== 'medium' && e !== 'high') throw new GtdError('energia inválida');
	return e;
}

function cleanMinutes(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = Number(v);
	if (!Number.isInteger(n) || n <= 0) throw new GtdError('tempo inválido');
	return n;
}

// Estados "de lista" respeitam a data de início: futura => agendada; vencida => próxima.
export function resolveState(state: string, startsAt: number | null, today: number): StateList {
	if (!isStateList(state)) throw new GtdError('lista inválida');
	if (state === 'scheduled') {
		if (startsAt == null) throw new GtdError('informe a data de início para agendar');
		return startsAt <= today ? 'next' : 'scheduled';
	}
	if ((state === 'next' || state === 'later') && startsAt != null && startsAt > today) {
		return 'scheduled';
	}
	return state;
}

function nextPosition(db: DatabaseSync): number {
	const r = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM items').get();
	return Number(r?.p ?? 0);
}

function setTags(db: DatabaseSync, itemId: number, tags: unknown) {
	const names = Array.isArray(tags) ? tags.map(String) : parseTagNames(tags);
	db.prepare('DELETE FROM item_tags WHERE item_id = ?').run(itemId);
	for (const id of ensureTagIds(db, parseTagNames(names.join(',')))) {
		db.prepare('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)').run(itemId, id);
	}
}

function tx<T>(db: DatabaseSync, fn: () => T): T {
	if (db.isTransaction) return fn();
	db.exec('BEGIN;');
	try {
		const r = fn();
		db.exec('COMMIT;');
		return r;
	} catch (e) {
		db.exec('ROLLBACK;');
		throw e;
	}
}

export function captureItem(
	db: DatabaseSync,
	input: ItemInput,
	today: number
): number {
	return tx(db, () => {
		const title = cleanTitle(input.title);
		const startsAt = input.startsAt ?? null;
		const state = resolveState(String(input.state ?? 'inbox'), startsAt, today);
		const now = Date.now();
		const id = Number(
			db
				.prepare(
					`INSERT INTO items (kind, title, notes, state, due_at, starts_at, energy, minutes, starred,
						project_id, area_id, delegated_to_id, position, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					input.kind === 'reference' ? 'reference' : 'task',
					title,
					String(input.notes ?? ''),
					state,
					input.dueAt ?? null,
					startsAt,
					cleanEnergy(input.energy),
					cleanMinutes(input.minutes),
					input.starred ? 1 : 0,
					input.projectId ?? null,
					input.areaId ?? null,
					input.contactId ?? null,
					nextPosition(db),
					now,
					now
				).lastInsertRowid
		);
		if (input.tags) setTags(db, id, input.tags);
		if (input.recurrence) setRecurrence(db, id, input.recurrence);
		return id;
	});
}

export function updateItem(db: DatabaseSync, id: number, input: ItemInput, today: number): void {
	tx(db, () => {
		const cur = getItem(db, id);
		if (cur.state === 'trash' || cur.state === 'completed') {
			throw new GtdError('restaure o item antes de editar');
		}
		const startsAt = input.startsAt === undefined ? cur.startsAt : input.startsAt;
		const state = resolveState(String(input.state ?? cur.state), startsAt, today);
		db.prepare(
			`UPDATE items SET title = ?, notes = ?, state = ?, due_at = ?, starts_at = ?, energy = ?,
				minutes = ?, starred = ?, project_id = ?, area_id = ?, delegated_to_id = ?, updated_at = ?
			WHERE id = ?`
		).run(
			cleanTitle(input.title ?? cur.title),
			String(input.notes ?? cur.notes),
			state,
			input.dueAt === undefined ? cur.dueAt : input.dueAt,
			startsAt,
			input.energy === undefined ? cur.energy : cleanEnergy(input.energy),
			input.minutes === undefined ? cur.minutes : cleanMinutes(input.minutes),
			(input.starred ?? cur.starred) ? 1 : 0,
			input.projectId === undefined ? cur.projectId : input.projectId,
			input.areaId === undefined ? cur.areaId : input.areaId,
			input.contactId === undefined ? cur.contactId : input.contactId,
			Date.now(),
			id
		);
		if (input.tags !== undefined) setTags(db, id, input.tags);
		if (input.recurrence !== undefined) setRecurrence(db, id, input.recurrence);
	});
}

export function setRecurrence(db: DatabaseSync, id: number, value: unknown): void {
	const rule = parseRecurrence(value);
	if (!rule) {
		db.prepare('DELETE FROM recurrences WHERE item_id = ?').run(id);
		return;
	}
	const cur = getItem(db, id);
	if (cur.dueAt == null && cur.startsAt == null) {
		throw new GtdError('defina uma data de início ou de vencimento para repetir');
	}
	db.prepare(
		'INSERT INTO recurrences (item_id, rule) VALUES (?, ?) ON CONFLICT(item_id) DO UPDATE SET rule = excluded.rule'
	).run(id, `${rule.unit}:${rule.every}`);
}

export function moveItem(
	db: DatabaseSync,
	id: number,
	state: string,
	today: number,
	startsAt?: number | null
): void {
	const cur = getItem(db, id);
	if (cur.state === 'trash' || cur.state === 'completed') {
		throw new GtdError('restaure o item antes de mover');
	}
	const start = startsAt === undefined ? cur.startsAt : startsAt;
	const target = resolveState(state, start, today);
	db.prepare('UPDATE items SET state = ?, starts_at = ?, updated_at = ? WHERE id = ?').run(
		target,
		start,
		Date.now(),
		id
	);
}

function archive(db: DatabaseSync, id: number, state: 'completed' | 'trash') {
	const cur = getItem(db, id);
	if (cur.state === 'trash' || cur.state === 'completed') return;
	const now = Date.now();
	db.prepare(
		'UPDATE items SET state = ?, previous_state = ?, completed_at = ?, updated_at = ? WHERE id = ?'
	).run(state, cur.state, state === 'completed' ? now : null, now, id);
}

// Ao concluir, a recorrência passa para a próxima ocorrência (criada uma única vez:
// o item concluído perde a regra, então concluir de novo não gera outra cópia).
export function completeItem(db: DatabaseSync, id: number, today = startOfTodayUtc()): number | null {
	return tx(db, () => {
		const cur = getItem(db, id);
		if (cur.state === 'trash' || cur.state === 'completed') return null;
		archive(db, id, 'completed');
		if (!cur.recurrence) return null;
		const rule = parseRecurrence(cur.recurrence)!;
		const nextId = copyItem(db, cur, {
			title: cur.title,
			state: cur.state === 'inbox' ? 'next' : cur.state,
			dueAt: cur.dueAt == null ? null : advanceDate(cur.dueAt, rule),
			startsAt: cur.startsAt == null ? null : advanceDate(cur.startsAt, rule),
			resetChecklist: true,
			today
		});
		db.prepare('DELETE FROM recurrences WHERE item_id = ?').run(id);
		db.prepare('INSERT INTO recurrences (item_id, rule) VALUES (?, ?)').run(nextId, cur.recurrence);
		return nextId;
	});
}

function copyItem(
	db: DatabaseSync,
	src: Item,
	o: {
		title: string;
		state: string;
		dueAt: number | null;
		startsAt: number | null;
		resetChecklist: boolean;
		today: number;
	}
): number {
	const now = Date.now();
	const state = resolveState(o.state, o.startsAt, o.today);
	const id = Number(
		db
			.prepare(
				`INSERT INTO items (kind, title, notes, state, due_at, starts_at, energy, minutes, starred,
					project_id, area_id, delegated_to_id, position, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				src.kind,
				o.title,
				src.notes,
				state,
				o.dueAt,
				o.startsAt,
				src.energy,
				src.minutes,
				src.starred ? 1 : 0,
				src.projectId,
				src.areaId,
				src.contactId,
				nextPosition(db),
				now,
				now
			).lastInsertRowid
	);
	db.prepare(
		'INSERT INTO item_tags (item_id, tag_id) SELECT ?, tag_id FROM item_tags WHERE item_id = ?'
	).run(id, src.id);
	db.prepare(
		`INSERT INTO checklist_items (item_id, title, done, position)
		SELECT ?, title, ${o.resetChecklist ? '0' : 'done'}, position FROM checklist_items WHERE item_id = ?`
	).run(id, src.id);
	return id;
}

export function duplicateItem(db: DatabaseSync, id: number, today = startOfTodayUtc()): number {
	return tx(db, () => {
		const cur = getItem(db, id);
		const archived = cur.state === 'trash' || cur.state === 'completed';
		return copyItem(db, cur, {
			title: `${cur.title} (cópia)`,
			state: archived ? (cur.previousState ?? 'inbox') : cur.state,
			dueAt: cur.dueAt,
			startsAt: cur.startsAt,
			resetChecklist: false,
			today
		});
	});
}

export type ChecklistEntry = { id: number; title: string; done: boolean };

export function listChecklist(db: DatabaseSync, itemId: number): ChecklistEntry[] {
	return db
		.prepare('SELECT id, title, done FROM checklist_items WHERE item_id = ? ORDER BY position, id')
		.all(itemId)
		.map((r) => ({ id: Number(r.id), title: String(r.title), done: Number(r.done) === 1 }));
}

export function addChecklistEntry(db: DatabaseSync, itemId: number, title: unknown): number {
	getItem(db, itemId);
	const t = String(title ?? '').trim();
	if (!t) throw new GtdError('título do passo é obrigatório');
	if (t.length > 300) throw new GtdError('título do passo muito longo');
	const pos = Number(
		db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM checklist_items WHERE item_id = ?').get(itemId)!.p
	);
	return Number(
		db.prepare('INSERT INTO checklist_items (item_id, title, position) VALUES (?, ?, ?)').run(itemId, t, pos)
			.lastInsertRowid
	);
}

export function toggleChecklistEntry(db: DatabaseSync, entryId: number, done: boolean): void {
	const r = db.prepare('UPDATE checklist_items SET done = ? WHERE id = ?').run(done ? 1 : 0, entryId);
	if (!r.changes) throw new GtdError('passo não encontrado', 404);
}

export function removeChecklistEntry(db: DatabaseSync, entryId: number): void {
	db.prepare('DELETE FROM checklist_items WHERE id = ?').run(entryId);
}
export const trashItem = (db: DatabaseSync, id: number) => archive(db, id, 'trash');

export function restoreItem(db: DatabaseSync, id: number, today: number): void {
	const cur = getItem(db, id);
	if (cur.state !== 'trash' && cur.state !== 'completed') return;
	const target = resolveState(cur.previousState ?? 'inbox', cur.startsAt, today);
	db.prepare(
		'UPDATE items SET state = ?, previous_state = NULL, completed_at = NULL, updated_at = ? WHERE id = ?'
	).run(target, Date.now(), id);
}

export function setStarred(db: DatabaseSync, id: number, starred: boolean): void {
	getItem(db, id);
	db.prepare('UPDATE items SET starred = ?, updated_at = ? WHERE id = ?').run(
		starred ? 1 : 0,
		Date.now(),
		id
	);
}

export function setKind(db: DatabaseSync, id: number, kind: string): void {
	if (kind !== 'task' && kind !== 'reference') throw new GtdError('tipo inválido');
	getItem(db, id);
	db.prepare('UPDATE items SET kind = ?, updated_at = ? WHERE id = ?').run(kind, Date.now(), id);
}

// Redistribui as posições já usadas entre os ids, na nova ordem.
export function reorderItems(db: DatabaseSync, ids: number[]): void {
	if (ids.length < 2) return;
	tx(db, () => {
		const marks = ids.map(() => '?').join(',');
		const rows = db
			.prepare(`SELECT id, position FROM items WHERE id IN (${marks})`)
			.all(...ids);
		if (rows.length !== new Set(ids).size) throw new GtdError('itens inválidos');
		let positions = rows.map((r) => Number(r.position)).sort((a, b) => a - b);
		if (new Set(positions).size !== positions.length) positions = ids.map((_, i) => i);
		ids.forEach((id, i) => {
			db.prepare('UPDATE items SET position = ? WHERE id = ?').run(positions[i], id);
		});
	});
}

export function deleteItemPermanently(db: DatabaseSync, id: number): void {
	if (getItem(db, id).state !== 'trash') throw new GtdError('só é possível excluir itens da lixeira');
	db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

export function emptyTrash(db: DatabaseSync): number {
	return Number(db.prepare("DELETE FROM items WHERE state = 'trash'").run().changes);
}

// Remove do Diário o que foi concluído há mais de `days` dias (0 = guardar para sempre).
export function purgeLogbook(db: DatabaseSync, days: number, now = Date.now()): number {
	if (!(days > 0)) return 0;
	return Number(
		db
			.prepare("DELETE FROM items WHERE state = 'completed' AND completed_at < ?")
			.run(now - days * 86_400_000).changes
	);
}

export const BULK_OPS = ['move', 'complete', 'trash', 'restore', 'tag', 'star', 'unstar'] as const;

export function bulkApply(
	db: DatabaseSync,
	ids: number[],
	op: string,
	today: number,
	arg = ''
): void {
	if (!(BULK_OPS as readonly string[]).includes(op)) throw new GtdError('operação inválida');
	if (ids.length === 0) throw new GtdError('selecione ao menos um item');
	tx(db, () => {
		for (const id of ids) {
			if (op === 'move') moveItem(db, id, arg, today);
			else if (op === 'complete') completeItem(db, id, today);
			else if (op === 'trash') trashItem(db, id);
			else if (op === 'restore') restoreItem(db, id, today);
			else if (op === 'star' || op === 'unstar') setStarred(db, id, op === 'star');
			else {
				const names = parseTagNames(arg);
				if (names.length === 0) throw new GtdError('informe a tag');
				const cur = getItem(db, id);
				setTags(db, id, [...cur.tags, ...names]);
			}
		}
	});
}

export function activateScheduled(db: DatabaseSync, today: number): void {
	db.prepare(
		`UPDATE items SET state = 'next', updated_at = ? WHERE state = 'scheduled' AND starts_at IS NOT NULL AND starts_at <= ?`
	).run(Date.now(), today);
}

function filterSql(filter: ViewFilter, params: SQLInputValue[], today: number): string {
	let sql = '';
	if (filter.energy) {
		sql += ' AND i.energy = ?';
		params.push(filter.energy);
	}
	if (filter.maxMinutes) {
		sql += ' AND (i.minutes IS NULL OR i.minutes <= ?)';
		params.push(filter.maxMinutes);
	}
	if (filter.contactId) {
		sql += ' AND i.delegated_to_id = ?';
		params.push(filter.contactId);
	}
	if (filter.projectId) {
		sql += ' AND i.project_id = ?';
		params.push(filter.projectId);
	}
	if (filter.due === 'overdue') {
		sql += ' AND i.due_at IS NOT NULL AND i.due_at < ?';
		params.push(today);
	} else if (filter.due === 'week') {
		sql += ' AND i.due_at IS NOT NULL AND i.due_at <= ?';
		// Fim da semana civil (domingo ou sábado, conforme a preferência), contando o dia de hoje.
		const dow = new Date(today).getUTCDay();
		const toEnd = filter.weekStart === 0 ? 6 - dow : (7 - dow) % 7;
		params.push(today + toEnd * 86_400_000);
	}
	if (filter.area === 'none') sql += ' AND COALESCE(i.area_id, p.area_id) IS NULL';
	else if (filter.area != null) {
		sql += filter.includeUnassigned
			? ' AND (COALESCE(i.area_id, p.area_id) = ? OR COALESCE(i.area_id, p.area_id) IS NULL)'
			: ' AND COALESCE(i.area_id, p.area_id) = ?';
		params.push(filter.area);
	}
	if (filter.tagId != null) {
		sql += ' AND EXISTS (SELECT 1 FROM item_tags x WHERE x.item_id = i.id AND x.tag_id = ?)';
		params.push(filter.tagId);
	}
	return sql;
}

const ACTIONABLE = " AND (i.project_id IS NULL OR p.state = 'active')";
// Em projetos sequenciais só a primeira ação aberta (por posição) fica disponível.
const SEQUENTIAL = ` AND (i.project_id IS NULL OR p.execution_mode = 'parallel' OR i.id = (
	SELECT i2.id FROM items i2 WHERE i2.project_id = i.project_id AND i2.kind = 'task'
	AND i2.state NOT IN ('completed', 'trash', 'inbox') ORDER BY i2.position, i2.id LIMIT 1))`;

// Focus = marcadas com estrela (manual) + próximas ações vencidas ou com prazo hoje (automático).
export function listItems(
	db: DatabaseSync,
	list: ListName,
	filter: ViewFilter = NO_FILTER,
	today = startOfTodayUtc()
): Item[] {
	const params: SQLInputValue[] = [];
	let where: string;
	let order = 'i.position, i.id';
	switch (list) {
		case 'logbook':
			where = "i.state = 'completed'";
			order = 'i.completed_at DESC, i.id DESC';
			break;
		case 'trash':
			where = "i.state = 'trash'";
			order = 'i.updated_at DESC, i.id DESC';
			break;
		case 'focus':
			where = `(i.starred = 1 OR (i.state = 'next' AND i.due_at IS NOT NULL AND i.due_at <= ?))
				AND i.state NOT IN ('completed', 'trash')${ACTIONABLE}${SEQUENTIAL}`;
			params.push(today);
			break;
		case 'inbox':
			where = "i.state = 'inbox'";
			break;
		case 'scheduled':
			where = `i.state = 'scheduled'${ACTIONABLE}`;
			order = 'i.starts_at IS NULL, i.starts_at, i.position, i.id';
			break;
		default:
			where = `i.state = ?${ACTIONABLE}${list === 'next' ? SEQUENTIAL : ''}`;
			params.push(list);
	}
	where += filterSql(filter, params, today);
	if (filter.sort === 'due' && list !== 'logbook' && list !== 'trash') {
		order = 'i.due_at IS NULL, i.due_at, i.position, i.id';
	}
	return db
		.prepare(`${SELECT} WHERE ${where} ORDER BY ${order}`)
		.all(...params)
		.map(mapItem);
}

// Calendário: itens abertos com prazo ou início no intervalo [from, to] (nulos = sem limite).
// Usa idx_items_due / idx_items_starts. Com `includeOverdue`, prazos atrasados também entram
// (e inícios passados não).
export function listCalendarItems(
	db: DatabaseSync,
	from: number | null,
	to: number | null,
	filter: ViewFilter = NO_FILTER,
	today = startOfTodayUtc(),
	includeOverdue = false,
	limit = 1000,
	mode: 'both' | 'planned' | 'deadlines' = 'both'
): Item[] {
	const params: SQLInputValue[] = [];
	const bound = (col: string, lo: number | null) => {
		const parts = [`${col} IS NOT NULL`];
		if (lo != null) {
			parts.push(`${col} >= ?`);
			params.push(lo);
		}
		if (to != null) {
			parts.push(`${col} <= ?`);
			params.push(to);
		}
		return `(${parts.join(' AND ')})`;
	};
	// A ordem dos parâmetros segue a de uso em `dates`: prazo antes de início.
	const due = mode === 'planned' ? '' : bound('i.due_at', includeOverdue ? null : from);
	const start = mode === 'deadlines' ? '' : bound('i.starts_at', includeOverdue ? (from ?? today) : from);
	const dates = mode === 'planned' ? start : mode === 'deadlines' ? due : `(${due} OR ${start})`;
	let where = `i.state NOT IN ('completed', 'trash') AND ${dates}`;
	where += filterSql(filter, params, today);
	params.push(limit);
	return db
		.prepare(`${SELECT} WHERE ${where} ORDER BY COALESCE(i.due_at, i.starts_at), i.position, i.id LIMIT ?`)
		.all(...params)
		.map(mapItem);
}

// Gantt: itens abertos com início e prazo cujo período cruza [from, to].
export function listGanttItems(
	db: DatabaseSync,
	from: number,
	to: number,
	filter: ViewFilter = NO_FILTER,
	today = startOfTodayUtc(),
	limit = 500
): Item[] {
	const params: SQLInputValue[] = [to, from];
	let where = `i.state NOT IN ('completed', 'trash') AND i.starts_at IS NOT NULL AND i.due_at IS NOT NULL AND i.starts_at <= ? AND i.due_at >= ?`;
	where += filterSql(filter, params, today);
	params.push(limit);
	return db
		.prepare(`${SELECT} WHERE ${where} ORDER BY i.starts_at, i.due_at, i.id LIMIT ?`)
		.all(...params)
		.map(mapItem);
}

export type Counts = {
	inbox: number;
	waiting: number;
	focus: number;
	overdue: number;
	lists: Record<StateList, number>;
};

export function countItems(db: DatabaseSync, filter: ViewFilter, today: number): Counts {
	const count = (list: ListName) => listItems(db, list, filter, today);
	const focus = count('focus');
	return {
		inbox: count('inbox').length,
		waiting: count('waiting').length,
		focus: focus.length,
		overdue: focus.filter((i) => i.dueAt != null && i.dueAt < today).length,
		lists: Object.fromEntries(STATE_LISTS.map((l) => [l, count(l).length])) as Counts['lists']
	};
}

export function searchItems(db: DatabaseSync, query: string): Item[] {
	const q = query.trim();
	if (!q) return [];
	const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
	return db
		.prepare(
			`${SELECT} WHERE (i.title LIKE ?1 ESCAPE '\\' OR i.notes LIKE ?1 ESCAPE '\\'
				OR p.name LIKE ?1 ESCAPE '\\'
				OR EXISTS (SELECT 1 FROM item_tags x JOIN tags t ON t.id = x.tag_id
					WHERE x.item_id = i.id AND t.name LIKE ?1 ESCAPE '\\'))
			AND i.state != 'trash' ORDER BY i.state = 'completed', i.updated_at DESC LIMIT 200`
		)
		.all(like)
		.map(mapItem);
}

export function listReferences(db: DatabaseSync, query = '', filter: ViewFilter = NO_FILTER): Item[] {
	const params: SQLInputValue[] = [];
	let where = "i.kind = 'reference' AND i.state NOT IN ('trash', 'completed')";
	const q = query.trim();
	if (q) {
		where += " AND (i.title LIKE ?1 ESCAPE '\\' OR i.notes LIKE ?1 ESCAPE '\\')";
		params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
	}
	const extra: SQLInputValue[] = [];
	where += filterSql(filter, extra, startOfTodayUtc());
	// Parâmetros numerados (?1) não podem se misturar com posicionais; refaz a numeração.
	let n = params.length;
	where = where.replace(/\?(?!\d)/g, () => `?${++n}`);
	return db
		.prepare(`${SELECT} WHERE ${where} ORDER BY i.updated_at DESC, i.id DESC`)
		.all(...params, ...extra)
		.map(mapItem);
}

export function projectItems(db: DatabaseSync, projectId: number, completedLast = true): Item[] {
	return db
		.prepare(
			`${SELECT} WHERE i.project_id = ? AND i.state != 'trash'
			ORDER BY ${completedLast ? "i.state = 'completed'," : ''} i.position, i.id`
		)
		.all(projectId)
		.map(mapItem);
}

export { STATE_LISTS };

// Itens exibidos nos quadros Kanban: tudo que não está na lixeira; concluídos limitados aos 100 mais recentes.
export function listBoardItems(
	db: DatabaseSync,
	filter: ViewFilter,
	today: number,
	projectId: number | null
): Item[] {
	const params: SQLInputValue[] = [];
	const where = filterSql({ ...filter, projectId: projectId ?? filter.projectId }, params, today);
	return db
		.prepare(
			`${SELECT} WHERE i.state != 'trash'
			AND (i.state != 'completed' OR i.id IN (
				SELECT id FROM items WHERE state = 'completed' ORDER BY completed_at DESC LIMIT 100))${where}
			ORDER BY i.position, i.id`
		)
		.all(...params)
		.map(mapItem);
}
