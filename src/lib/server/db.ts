import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDatabase, type Database } from '#lib/db/client.ts';

let db: Database | null = null;

export function getDatabasePath(): string {
	return process.env.GTDONE_DB_PATH ?? join(process.cwd(), 'data', 'gtdone.db');
}

export function getDb(): Database {
	if (!db) {
		const path = getDatabasePath();
		mkdirSync(dirname(path), { recursive: true });
		db = openDatabase(path);
	}
	return db;
}
