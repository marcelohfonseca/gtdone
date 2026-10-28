import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, closeDatabase } from '#lib/db/client.ts';
import { startBackupScheduler, BACKUP_INTERVAL_MS } from './backup-scheduler.ts';

afterEach(() => {
	vi.useRealTimers();
});

describe('startBackupScheduler', () => {
	it('cria backup imediatamente no boot e depois a cada 24 horas', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const root = mkdtempSync(join(tmpdir(), 'gtdone-scheduler-'));
		const db = openDatabase(join(root, 'data.db'));
		const backupDir = join(root, 'backups');
		const stop = startBackupScheduler({ db, backupDir, keep: 7 });
		try {
			expect(readdirSync(backupDir).filter((file) => file.endsWith('.db'))).toHaveLength(1);

			vi.advanceTimersByTime(BACKUP_INTERVAL_MS);
			expect(readdirSync(backupDir).filter((file) => file.endsWith('.db'))).toHaveLength(2);

			stop();
			vi.advanceTimersByTime(BACKUP_INTERVAL_MS);
			expect(readdirSync(backupDir).filter((file) => file.endsWith('.db'))).toHaveLength(2);
		} finally {
			stop();
			closeDatabase(db);
		}
	});

	it('reporta falhas sem derrubar o servidor e tenta novamente no próximo ciclo', () => {
		vi.useFakeTimers();
		const root = mkdtempSync(join(tmpdir(), 'gtdone-scheduler-error-'));
		const db = openDatabase(join(root, 'data.db'));
		const onError = vi.fn();
		writeFileSync(join(root, 'not-a-directory'), 'file');
		const backupDir = join(root, 'not-a-directory', 'backups');
		const stop = startBackupScheduler({ db, backupDir, keep: 7, onError });
		try {
			expect(onError).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(BACKUP_INTERVAL_MS);
			expect(onError).toHaveBeenCalledTimes(2);
		} finally {
			stop();
			closeDatabase(db);
		}
	});
});
