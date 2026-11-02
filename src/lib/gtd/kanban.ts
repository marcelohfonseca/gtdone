import type { DatabaseSync } from 'node:sqlite';
import { GtdError } from './core.ts';
import {
	completeItem,
	getItem,
	listBoardItems,
	moveItem,
	updateItem,
	type Item,
	type ViewFilter
} from './items.ts';

export const BOARD_GROUPINGS = ['state', 'project', 'area', 'custom'] as const;
export type BoardGrouping = (typeof BOARD_GROUPINGS)[number];

// Estados que podem virar coluna; os padrões não incluem "Agendadas" (mover para lá exige uma data).
export const BOARD_STATES = ['inbox', 'next', 'waiting', 'later', 'scheduled', 'someday', 'completed'] as const;
export const DEFAULT_STATE_COLUMNS: [string, string][] = [
	['inbox', 'Entrada'],
	['next', 'Próximas'],
	['waiting', 'Aguardando'],
	['later', 'Depois'],
	['someday', 'Algum dia'],
	['completed', 'Concluídas']
];
const DEFAULT_CUSTOM_COLUMNS = ['A fazer', 'Fazendo', 'Feito'];
const NONE = 'none';

export type Board = {
	id: number;
	name: string;
	groupBy: BoardGrouping;
	projectId: number | null;
};

export type BoardColumn = {
	// Identifica a coluna na movimentação: estado, id de projeto/área, "none" ou id da coluna personalizada.
	key: string;
	// Id da linha em board_columns (só colunas de estado e personalizadas).
	id: number | null;
	name: string;
	// Só colunas de estado e personalizadas são editáveis.
	editable: boolean;
	items: Item[];
};

export type BoardView = { board: Board; columns: BoardColumn[] };

function mapBoard(r: Record<string, unknown>): Board {
	return {
		id: Number(r.id),
		name: String(r.name),
		groupBy: String(r.group_by) as BoardGrouping,
		projectId: r.project_id == null ? null : Number(r.project_id)
	};
}

function cleanName(v: unknown): string {
	const n = String(v ?? '').trim();
	if (!n) throw new GtdError('informe um nome');
	if (n.length > 100) throw new GtdError('nome muito longo');
	return n;
}

export function listBoards(db: DatabaseSync): Board[] {
	return db.prepare('SELECT * FROM boards ORDER BY position, id').all().map(mapBoard);
}

export function getBoard(db: DatabaseSync, id: number): Board {
	const r = db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
	if (!r) throw new GtdError('quadro não encontrado', 404);
	return mapBoard(r);
}

function checkProject(db: DatabaseSync, projectId: number | null) {
	if (projectId != null && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
		throw new GtdError('projeto não encontrado', 404);
	}
}

function checkGrouping(v: unknown): BoardGrouping {
	if (!(BOARD_GROUPINGS as readonly string[]).includes(String(v))) throw new GtdError('agrupamento inválido');
	return String(v) as BoardGrouping;
}

function seedColumns(db: DatabaseSync, boardId: number, groupBy: BoardGrouping) {
	const ins = db.prepare('INSERT INTO board_columns (board_id, name, state_key, position) VALUES (?, ?, ?, ?)');
	if (groupBy === 'state') DEFAULT_STATE_COLUMNS.forEach(([k, n], i) => ins.run(boardId, n, k, i));
	else if (groupBy === 'custom') DEFAULT_CUSTOM_COLUMNS.forEach((n, i) => ins.run(boardId, n, null, i));
}

export function createBoard(
	db: DatabaseSync,
	input: { name: unknown; groupBy?: unknown; projectId?: number | null }
): number {
	const groupBy = checkGrouping(input.groupBy ?? 'state');
	const projectId = input.projectId ?? null;
	checkProject(db, projectId);
	const now = Date.now();
	const pos = Number(db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM boards').get()?.p ?? 0);
	const id = Number(
		db
			.prepare('INSERT INTO boards (name, group_by, project_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
			.run(cleanName(input.name), groupBy, projectId, pos, now, now).lastInsertRowid
	);
	seedColumns(db, id, groupBy);
	return id;
}

// Trocar o agrupamento recria as colunas (e descarta a distribuição manual dos cartões).
export function updateBoard(
	db: DatabaseSync,
	id: number,
	input: { name?: unknown; groupBy?: unknown; projectId?: number | null }
): void {
	const cur = getBoard(db, id);
	const groupBy = input.groupBy === undefined ? cur.groupBy : checkGrouping(input.groupBy);
	const projectId = input.projectId === undefined ? cur.projectId : input.projectId;
	checkProject(db, projectId);
	db.prepare('UPDATE boards SET name = ?, group_by = ?, project_id = ?, updated_at = ? WHERE id = ?').run(
		input.name === undefined ? cur.name : cleanName(input.name),
		groupBy,
		projectId,
		Date.now(),
		id
	);
	if (groupBy !== cur.groupBy) {
		db.prepare('DELETE FROM board_columns WHERE board_id = ?').run(id);
		seedColumns(db, id, groupBy);
	}
}

export function deleteBoard(db: DatabaseSync, id: number): void {
	getBoard(db, id);
	db.prepare('DELETE FROM boards WHERE id = ?').run(id);
}

function assertColumnsEditable(board: Board) {
	if (board.groupBy !== 'state' && board.groupBy !== 'custom') {
		throw new GtdError('as colunas deste agrupamento são automáticas');
	}
}

function columnOf(db: DatabaseSync, boardId: number, columnId: number) {
	const r = db.prepare('SELECT * FROM board_columns WHERE id = ? AND board_id = ?').get(columnId, boardId);
	if (!r) throw new GtdError('coluna não encontrada', 404);
	return r;
}

export function addColumn(db: DatabaseSync, boardId: number, name: unknown, stateKey?: unknown): number {
	const board = getBoard(db, boardId);
	assertColumnsEditable(board);
	let key: string | null = null;
	if (board.groupBy === 'state') {
		key = String(stateKey ?? '');
		if (!(BOARD_STATES as readonly string[]).includes(key)) throw new GtdError('estado inválido');
		if (db.prepare('SELECT 1 FROM board_columns WHERE board_id = ? AND state_key = ?').get(boardId, key)) {
			throw new GtdError('já existe uma coluna para esse estado');
		}
	}
	const pos = Number(
		db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM board_columns WHERE board_id = ?').get(boardId)?.p ?? 0
	);
	return Number(
		db
			.prepare('INSERT INTO board_columns (board_id, name, state_key, position) VALUES (?, ?, ?, ?)')
			.run(boardId, cleanName(name), key, pos).lastInsertRowid
	);
}

export function renameColumn(db: DatabaseSync, boardId: number, columnId: number, name: unknown): void {
	columnOf(db, boardId, columnId);
	db.prepare('UPDATE board_columns SET name = ? WHERE id = ?').run(cleanName(name), columnId);
}

export function removeColumn(db: DatabaseSync, boardId: number, columnId: number): void {
	columnOf(db, boardId, columnId);
	db.prepare('DELETE FROM board_columns WHERE id = ?').run(columnId);
}

export function shiftColumn(db: DatabaseSync, boardId: number, columnId: number, dir: -1 | 1): void {
	columnOf(db, boardId, columnId);
	const ids = db
		.prepare('SELECT id FROM board_columns WHERE board_id = ? ORDER BY position, id')
		.all(boardId)
		.map((r) => Number(r.id));
	const i = ids.indexOf(columnId);
	const j = i + dir;
	if (j < 0 || j >= ids.length) return;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	const upd = db.prepare('UPDATE board_columns SET position = ? WHERE id = ?');
	ids.forEach((id, pos) => upd.run(pos, id));
}

export function boardView(
	db: DatabaseSync,
	id: number,
	filter: ViewFilter,
	today: number,
	names: { none: string }
): BoardView {
	const board = getBoard(db, id);
	const items = listBoardItems(db, filter, today, board.projectId);
	const columns: BoardColumn[] = [];
	if (board.groupBy === 'state') {
		for (const c of db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position, id').all(id)) {
			const key = String(c.state_key);
			columns.push({ key, id: Number(c.id), name: String(c.name), editable: true, items: items.filter((i) => i.state === key) });
		}
	} else if (board.groupBy === 'custom') {
		const assigned = new Map(
			db
				.prepare('SELECT item_id, column_id FROM board_cards WHERE board_id = ?')
				.all(id)
				.map((r) => [Number(r.item_id), Number(r.column_id)])
		);
		const cols = db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY position, id').all(id);
		const first = cols.length ? Number(cols[0].id) : null;
		// Cartões ainda não distribuídos ficam na primeira coluna; concluídos só aparecem se já foram colocados.
		for (const c of cols) {
			const cid = Number(c.id);
			columns.push({
				key: String(cid),
				id: cid,
				name: String(c.name),
				editable: true,
				items: items.filter((i) => (assigned.get(i.id) ?? (i.state === 'completed' ? null : first)) === cid)
			});
		}
	} else if (board.groupBy === 'project') {
		const projects = board.projectId
			? db.prepare('SELECT id, name FROM projects WHERE id = ?').all(board.projectId)
			: db.prepare("SELECT id, name FROM projects WHERE state NOT IN ('completed', 'trash') ORDER BY name COLLATE NOCASE").all();
		columns.push({ key: NONE, id: null, name: names.none, editable: false, items: items.filter((i) => i.projectId == null) });
		for (const p of projects) {
			columns.push({ key: String(p.id), id: null, name: String(p.name), editable: false, items: items.filter((i) => i.projectId === Number(p.id)) });
		}
	} else {
		const rows = db.prepare('SELECT id, name FROM areas ORDER BY position, id').all();
		const projectAreas = new Map(
			db
				.prepare('SELECT id, area_id FROM projects')
				.all()
				.map((r) => [Number(r.id), r.area_id == null ? null : Number(r.area_id)])
		);
		const areaOf = (i: Item) => i.areaId ?? (i.projectId ? (projectAreas.get(i.projectId) ?? null) : null);
		columns.push({ key: NONE, id: null, name: names.none, editable: false, items: items.filter((i) => areaOf(i) == null) });
		for (const a of rows) {
			columns.push({ key: String(a.id), id: null, name: String(a.name), editable: false, items: items.filter((i) => areaOf(i) === Number(a.id)) });
		}
	}
	return { board, columns };
}

export function moveCard(
	db: DatabaseSync,
	boardId: number,
	itemId: number,
	columnKey: string,
	today: number
): void {
	const board = getBoard(db, boardId);
	const item = getItem(db, itemId);
	if (item.state === 'trash') throw new GtdError('item na lixeira');
	if (board.groupBy === 'state') {
		if (columnKey === item.state) return;
		if (columnKey === 'completed') completeItem(db, itemId, today);
		else if (!(BOARD_STATES as readonly string[]).includes(columnKey)) throw new GtdError('estado inválido');
		else moveItem(db, itemId, columnKey, today);
	} else if (board.groupBy === 'project') {
		if (columnKey !== NONE && !/^[1-9]\d*$/.test(columnKey)) throw new GtdError('coluna inválida');
		const pid = columnKey === NONE ? null : Number(columnKey);
		checkProject(db, pid);
		updateItem(db, itemId, { projectId: pid }, today);
	} else if (board.groupBy === 'area') {
		if (columnKey !== NONE && !/^[1-9]\d*$/.test(columnKey)) throw new GtdError('coluna inválida');
		const aid = columnKey === NONE ? null : Number(columnKey);
		if (aid != null && !db.prepare('SELECT 1 FROM areas WHERE id = ?').get(aid)) throw new GtdError('área inválida');
		updateItem(db, itemId, { areaId: aid }, today);
	} else {
		const col = columnOf(db, boardId, Number(columnKey));
		db.prepare(
			`INSERT INTO board_cards (board_id, item_id, column_id) VALUES (?, ?, ?)
			ON CONFLICT(board_id, item_id) DO UPDATE SET column_id = excluded.column_id`
		).run(boardId, itemId, Number(col.id));
	}
}
