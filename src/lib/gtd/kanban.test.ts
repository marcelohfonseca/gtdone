import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '#lib/db/migrations.ts';
import { captureItem, getItem } from './items.ts';
import { createProject } from './projects.ts';
import { NO_FILTER } from './items.ts';
import { addColumn, boardView, createBoard, moveCard, updateBoard } from './kanban.ts';

const TODAY = Date.UTC(2026, 0, 1);
const names = { none: 'Nenhum' };

function memDb() {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON;');
	runMigrations(db);
	return db;
}

describe('kanban', () => {
	it('groups by state and moves cards between states', () => {
		const db = memDb();
		const a = captureItem(db, { title: 'A', state: 'next' }, TODAY);
		const b = createBoard(db, { name: 'Estados' });
		moveCard(db, b, a, 'waiting', TODAY);
		expect(getItem(db, a).state).toBe('waiting');
		moveCard(db, b, a, 'completed', TODAY);
		const cols = boardView(db, b, NO_FILTER, TODAY, names).columns;
		expect(cols.find((c) => c.key === 'completed')?.items).toHaveLength(1);
	});

	it('filters a board to one project', () => {
		const db = memDb();
		const p = createProject(db, { name: 'P' }, TODAY);
		captureItem(db, { title: 'in', state: 'next', projectId: p }, TODAY);
		captureItem(db, { title: 'out', state: 'next' }, TODAY);
		const b = createBoard(db, { name: 'Só P', projectId: p });
		const next = boardView(db, b, NO_FILTER, TODAY, names).columns.find((c) => c.key === 'next');
		expect(next?.items.map((i) => i.title)).toEqual(['in']);
	});

	it('custom columns keep manual placement; unplaced cards go to the first column', () => {
		const db = memDb();
		const a = captureItem(db, { title: 'A', state: 'next' }, TODAY);
		const b = createBoard(db, { name: 'C', groupBy: 'custom' });
		let view = boardView(db, b, NO_FILTER, TODAY, names);
		expect(view.columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Feito']);
		expect(view.columns[0].items).toHaveLength(1);
		moveCard(db, b, a, view.columns[2].key, TODAY);
		view = boardView(db, b, NO_FILTER, TODAY, names);
		expect(view.columns[2].items).toHaveLength(1);
		expect(getItem(db, a).state).toBe('next');
		addColumn(db, b, 'Extra');
		expect(boardView(db, b, NO_FILTER, TODAY, names).columns).toHaveLength(4);
	});

	it('groups by project and reassigns on move; switching grouping rebuilds columns', () => {
		const db = memDb();
		const p = createProject(db, { name: 'P' }, TODAY);
		const a = captureItem(db, { title: 'A', state: 'next' }, TODAY);
		const b = createBoard(db, { name: 'Proj', groupBy: 'project' });
		moveCard(db, b, a, String(p), TODAY);
		expect(getItem(db, a).projectId).toBe(p);
		moveCard(db, b, a, 'none', TODAY);
		expect(getItem(db, a).projectId).toBeNull();
		updateBoard(db, b, { groupBy: 'state' });
		expect(boardView(db, b, NO_FILTER, TODAY, names).columns.length).toBeGreaterThan(3);
		expect(() => addColumn(db, b, 'x', 'next')).toThrow();
	});
});
