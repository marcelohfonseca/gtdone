import type { DatabaseSync } from 'node:sqlite';

export type Migration = {
	version: number;
	name: string;
	up: (db: DatabaseSync) => void;
};

const MIGRATIONS: Migration[] = [
	{
		version: 1,
		name: 'fundacao-schema-v1',
		up: (db) => {
			db.exec(`
				CREATE TABLE users (
					id INTEGER PRIMARY KEY,
					email TEXT NOT NULL UNIQUE,
					password_hash TEXT NOT NULL,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				);

				CREATE TABLE sessions (
					id TEXT PRIMARY KEY,
					user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
					expires_at INTEGER NOT NULL,
					created_at INTEGER NOT NULL
				);

				CREATE TABLE areas (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL,
					position INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				);

				CREATE TABLE tags (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL UNIQUE,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				);

				CREATE TABLE contacts (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL UNIQUE,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				);

				CREATE TABLE projects (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL,
					notes TEXT NOT NULL DEFAULT '',
					state TEXT NOT NULL DEFAULT 'active'
						CHECK (state IN ('active', 'completed')),
					area_id INTEGER REFERENCES areas(id),
					position INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL,
					completed_at INTEGER
				);

				CREATE TABLE items (
					id INTEGER PRIMARY KEY,
					kind TEXT NOT NULL DEFAULT 'task'
						CHECK (kind IN ('task', 'reference')),
					title TEXT NOT NULL,
					notes TEXT NOT NULL DEFAULT '',
					state TEXT NOT NULL DEFAULT 'inbox'
						CHECK (state IN ('inbox', 'next', 'waiting', 'scheduled', 'someday', 'trash', 'completed')),
					due_at INTEGER,
					starts_at INTEGER,
					energy TEXT CHECK (energy IN ('low', 'medium', 'high')),
					minutes INTEGER,
					starred INTEGER NOT NULL DEFAULT 0,
					project_id INTEGER REFERENCES projects(id),
					area_id INTEGER REFERENCES areas(id),
					delegated_to_id INTEGER REFERENCES contacts(id),
					position INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL,
					completed_at INTEGER
				);

				CREATE TABLE item_tags (
					item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
					tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
					PRIMARY KEY (item_id, tag_id)
				);

				CREATE TABLE project_tags (
					project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
					tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
					PRIMARY KEY (project_id, tag_id)
				);

				CREATE TABLE item_contacts (
					item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
					contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
					PRIMARY KEY (item_id, contact_id)
				);

				CREATE TABLE checklist_items (
					id INTEGER PRIMARY KEY,
					item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
					title TEXT NOT NULL,
					done INTEGER NOT NULL DEFAULT 0,
					position INTEGER NOT NULL DEFAULT 0
				);

				CREATE TABLE recurrences (
					id INTEGER PRIMARY KEY,
					item_id INTEGER NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
					rule TEXT NOT NULL
				);

				CREATE TABLE settings (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL
				);

				CREATE INDEX idx_items_state ON items(state);
				CREATE INDEX idx_items_project ON items(project_id);
				CREATE INDEX idx_items_area ON items(area_id);
				CREATE INDEX idx_items_due ON items(due_at);
				CREATE INDEX idx_items_starts ON items(starts_at);
				CREATE INDEX idx_projects_state ON projects(state);
				CREATE INDEX idx_sessions_user ON sessions(user_id);
			`);
		}
	}
];

export function runMigrations(db: DatabaseSync): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		);
	`);
	const applied = new Set(
		db.prepare('SELECT version FROM schema_migrations').all().map((r) => Number(r.version))
	);
	const now = Date.now();
	for (const m of MIGRATIONS) {
		if (applied.has(m.version)) continue;
		db.exec('BEGIN;');
		try {
			m.up(db);
			db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
				m.version,
				m.name,
				now
			);
			db.exec('COMMIT;');
		} catch (err) {
			db.exec('ROLLBACK;');
			throw err;
		}
	}
}

export function currentVersion(db: DatabaseSync): number {
	const row = db
		.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
		.get() as { v: number };
	return Number(row.v);
}
