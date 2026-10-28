import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openDatabase, type Database } from '#lib/db/client.ts';

let db: Database | null = null;

export function getDb(): Database {
	if (db) return db;
	const path =
		process.env.GTDONE_DB_PATH ?? join(process.cwd(), 'data', 'gtdone.db');
	mkdirSync(dirname(path), { recursive: true });
	db = openDatabase(path);
	return db;
}
