import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrations.ts';

export type Database = DatabaseSync;

export function openDatabase(path: string): Database {
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode = WAL;');
	db.exec('PRAGMA foreign_keys = ON;');
	runMigrations(db);
	return db;
}

export function closeDatabase(db: Database): void {
	db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
	db.close();
}
