import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, closeDatabase } from './client.ts';
import { currentVersion } from './migrations.ts';
import { backupDatabase, verifyBackup } from './backup.ts';

function freshDbPath(): string {
	return join(mkdtempSync(join(tmpdir(), 'gtdone-bkp-')), 'data.db');
}

describe('backupDatabase', () => {
	it('cria backup restaurável com schema aplicado', () => {
		const path = freshDbPath();
		const db = openDatabase(path);
		const backupDir = join(mkdtempSync(join(tmpdir(), 'gtdone-bkp-out-')), 'backups');
		try {
			const result = backupDatabase(db, { backupDir });
			expect(statSync(result.path).size).toBeGreaterThan(0);
			const restored = openDatabase(result.path);
			try {
				expect(currentVersion(restored)).toBe(10);
			} finally {
				closeDatabase(restored);
			}
		} finally {
			closeDatabase(db);
		}
	});

	it('backup preserva dados gravados após o schema', () => {
		const path = freshDbPath();
		const db = openDatabase(path);
		const backupDir = join(mkdtempSync(join(tmpdir(), 'gtdone-bkp-out-')), 'backups');
		try {
			const now = Date.now();
			db.prepare(
				"INSERT INTO items (title, state, created_at, updated_at) VALUES ('comprar leite', 'inbox', ?, ?)"
			).run(now, now);
			const result = backupDatabase(db, { backupDir });
			const restored = openDatabase(result.path);
			try {
				const title = (
					restored.prepare('SELECT title FROM items LIMIT 1').all() as { title: string }[]
				)[0]?.title;
				expect(title).toBe('comprar leite');
			} finally {
				closeDatabase(restored);
			}
		} finally {
			closeDatabase(db);
		}
	});

	it('aplica retenção mantendo os N backups mais novos', () => {
		const path = freshDbPath();
		const db = openDatabase(path);
		const backupDir = join(mkdtempSync(join(tmpdir(), 'gtdone-bkp-out-')), 'backups');
		try {
			let t = Date.now();
			backupDatabase(db, { backupDir, keep: 2, now: () => (t += 100000) });
			backupDatabase(db, { backupDir, keep: 2, now: () => (t += 100000) });
			backupDatabase(db, { backupDir, keep: 2, now: () => (t += 100000) });
			const files = readdirSync(backupDir).filter((f) => f.endsWith('.db'));
			expect(files).toHaveLength(2);
		} finally {
			closeDatabase(db);
		}
	});

	it('verifyBackup valida caminho existente e não vazio', () => {
		const path = freshDbPath();
		const db = openDatabase(path);
		const backupDir = join(mkdtempSync(join(tmpdir(), 'gtdone-bkp-out-')), 'backups');
		try {
			const result = backupDatabase(db, { backupDir });
			expect(verifyBackup(result.path)).toBe(true);
			expect(verifyBackup(join(backupDir, 'inexistente.db'))).toBe(false);
		} finally {
			closeDatabase(db);
		}
	});
});
