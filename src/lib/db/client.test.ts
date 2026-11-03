import { describe, it, expect } from 'vitest';
import { openDatabase, closeDatabase, type Database } from './client.ts';
import { currentVersion } from './migrations.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function freshDb(): Database {
	return openDatabase(join(mkdtempSync(join(tmpdir(), 'gtdone-')), 'test.db'));
}

describe('openDatabase', () => {
	it('aplica as migrações e define a versão atual do schema', () => {
		const db = freshDb();
		try {
			expect(currentVersion(db)).toBe(7);
		} finally {
			closeDatabase(db);
		}
	});

	it('é idempotente ao reaplicar migrações', () => {
		const path = join(mkdtempSync(join(tmpdir(), 'gtdone-')), 'test.db');
		const db = openDatabase(path);
		closeDatabase(db);
		const reopened = openDatabase(path);
		try {
			expect(currentVersion(reopened)).toBe(7);
			const rows = reopened
				.prepare('SELECT COUNT(*) AS c FROM schema_migrations')
				.get() as { c: number };
			expect(Number(rows.c)).toBe(7);
		} finally {
			closeDatabase(reopened);
		}
	});

	it('habilita chaves estrangeiras', () => {
		const db = freshDb();
		try {
			const fkOn = db;
			expect(fkOn).toBeTruthy();
			const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
			expect(Number(row.foreign_keys)).toBe(1);
		} finally {
			closeDatabase(db);
		}
	});

	it('usa WAL', () => {
		const db = freshDb();
		try {
			const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
			expect(String(row.journal_mode).toLowerCase()).toBe('wal');
		} finally {
			closeDatabase(db);
		}
	});
});

describe('schema v1', () => {
	it('cria as tabelas principais', () => {
		const db = freshDb();
		try {
			const tables = (
				db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
					name: string;
				}[]
			).map((r) => r.name);

			for (const t of [
				'users',
				'sessions',
				'areas',
				'tags',
				'contacts',
				'projects',
				'items',
				'item_tags',
				'project_tags',
				'item_contacts',
				'checklist_items',
				'recurrences',
				'settings',
				'schema_migrations'
			]) {
				expect(tables).toContain(t);
			}
		} finally {
			closeDatabase(db);
		}
	});

	it('respeita o CHECK de estado do item', () => {
		const db = freshDb();
		try {
			const now = Date.now();
			expect(() =>
				db
					.prepare(
						"INSERT INTO items (title, state, created_at, updated_at) VALUES ('x', 'invalido', ?, ?)"
					)
					.run(now, now)
			).toThrow();
		} finally {
			closeDatabase(db);
		}
	});

	it('apaga tags órfãs de item com ON DELETE CASCADE', () => {
		const db = freshDb();
		try {
			const now = Date.now();
			db.prepare(
				"INSERT INTO items (title, state, created_at, updated_at) VALUES ('t', 'inbox', ?, ?)"
			).run(now, now);
			db.prepare(
				'INSERT INTO tags (name, created_at, updated_at) VALUES (\'@casa\', ?, ?)'
			).run(now, now);
			db.prepare(
				'INSERT INTO item_tags (item_id, tag_id) SELECT i.id, t.id FROM items i, tags t LIMIT 1'
			).run();
			db.prepare('DELETE FROM items').run();
			const count = db.prepare('SELECT COUNT(*) AS c FROM item_tags').get() as { c: number };
			expect(Number(count.c)).toBe(0);
		} finally {
			closeDatabase(db);
		}
	});
});
