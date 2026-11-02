import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '#lib/db/migrations.ts';
import { captureItem, completeItem, deleteItemPermanently, trashItem } from './items.ts';
import { createProject } from './projects.ts';
import { createGoal, getGoal, goalLinks, linkGoal, listGoals, setGoalsFor, updateGoal, deleteGoal } from './goals.ts';

const TODAY = Date.UTC(2026, 0, 1);

function memDb() {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON;');
	runMigrations(db);
	return db;
}

describe('goals', () => {
	it('links tasks and projects and tracks progress', () => {
		const db = memDb();
		const goal = createGoal(db, { name: 'Saúde' });
		const item = captureItem(db, { title: 'Correr' }, TODAY);
		const other = captureItem(db, { title: 'Dormir' }, TODAY);
		const project = createProject(db, { name: 'Maratona' }, TODAY);
		linkGoal(db, goal, { itemId: item });
		linkGoal(db, goal, { itemId: item });
		linkGoal(db, goal, { itemId: other });
		linkGoal(db, goal, { projectId: project });
		expect(getGoal(db, goal).linkCount).toBe(3);
		completeItem(db, item, TODAY);
		expect(getGoal(db, goal).doneCount).toBe(1);
		expect(goalLinks(db, goal).projects[0].name).toBe('Maratona');
	});

	it('replaces the goal set of a target and cascades on delete', () => {
		const db = memDb();
		const a = createGoal(db, { name: 'A' });
		const b = createGoal(db, { name: 'B' });
		const item = captureItem(db, { title: 'x' }, TODAY);
		setGoalsFor(db, { itemId: item }, [a, b]);
		setGoalsFor(db, { itemId: item }, [b]);
		expect(getGoal(db, a).linkCount).toBe(0);
		expect(getGoal(db, b).linkCount).toBe(1);
		trashItem(db, item);
		deleteItemPermanently(db, item);
		expect(getGoal(db, b).linkCount).toBe(0);
		deleteGoal(db, b);
		expect(() => getGoal(db, b)).toThrow();
	});

	it('validates input and filters by status', () => {
		const db = memDb();
		expect(() => createGoal(db, { name: '  ' })).toThrow();
		const g = createGoal(db, { name: 'G' });
		expect(() => linkGoal(db, g, { itemId: 999 })).toThrow();
		updateGoal(db, g, { status: 'achieved' });
		expect(listGoals(db, ['active'])).toHaveLength(0);
		expect(getGoal(db, g).completedAt).not.toBeNull();
	});
});
