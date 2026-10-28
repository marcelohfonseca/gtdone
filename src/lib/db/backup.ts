import type { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, statSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type BackupOptions = {
	backupDir: string;
	keep?: number;
	now?: () => number;
};

export type BackupResult = {
	path: string;
	created: number;
	removed: string[];
};

export function backupDatabase(db: DatabaseSync, options: BackupOptions): BackupResult {
	const { backupDir } = options;
	const keep = Math.max(1, options.keep ?? 7);
	const now = options.now ?? (() => Date.now());

	mkdirSync(backupDir, { recursive: true });
	const created = now();
	const timestamp = new Date(created).toISOString().replace(/[:.]/g, '-');
	const finalPath = join(backupDir, `gtdone-${timestamp}.db`);
	const tmpPath = join(backupDir, `.tmp-${timestamp}.db`);

	db.exec(`VACUUM INTO '${tmpPath.replaceAll("'", "''")}'`);
	renameSync(tmpPath, finalPath);

	const removed = pruneOldBackups(backupDir, keep);
	return { path: finalPath, created, removed };
}

export function verifyBackup(backupPath: string): boolean {
	return existsSync(backupPath) && statSync(backupPath).size > 0;
}

function pruneOldBackups(backupDir: string, keep: number): string[] {
	const files = readdirSync(backupDir)
		.filter((f) => f.startsWith('gtdone-') && f.endsWith('.db'))
		.sort()
		.reverse();
	const removed: string[] = [];
	// keep é o total desejado: mantém os mais novos e remove o excedente
	// o backup recém-criado entra na contagem
	for (const f of files.slice(keep)) {
		rmSync(join(backupDir, f));
		removed.push(f);
	}
	return removed;
}
