import { join, dirname } from 'node:path';
import type { Database } from '#lib/db/client.ts';
import { backupDatabase } from '#lib/db/backup.ts';
import { getDatabasePath } from '#lib/server/db.ts';

export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type BackupSchedulerOptions = {
	db: Database;
	backupDir: string;
	keep: number;
	intervalMs?: number;
	onError?: (error: unknown) => void;
};

export function startBackupScheduler(options: BackupSchedulerOptions): () => void {
	const run = () => {
		try {
			backupDatabase(options.db, { backupDir: options.backupDir, keep: options.keep });
		} catch (error) {
			(options.onError ?? console.error)('[GTDone] Falha ao criar backup do SQLite:', error);
		}
	};

	run();
	const timer = setInterval(run, options.intervalMs ?? BACKUP_INTERVAL_MS);
	timer.unref();
	return () => clearInterval(timer);
}

export function ensureBackupScheduler(db: Database): void {
	const runtime = globalThis as typeof globalThis & {
		__gtdoneBackupSchedulerStop?: () => void;
	};
	if (runtime.__gtdoneBackupSchedulerStop) return;

	const keep = Number.parseInt(process.env.GTDONE_BACKUP_KEEP ?? '7', 10);
	runtime.__gtdoneBackupSchedulerStop = startBackupScheduler({
		db,
		backupDir:
			process.env.GTDONE_BACKUP_DIR ?? join(dirname(getDatabasePath()), 'backups'),
		keep: Number.isFinite(keep) ? Math.max(1, keep) : 7,
		onError: (error) => console.error('[GTDone] Falha ao criar backup do SQLite:', error)
	});
}
