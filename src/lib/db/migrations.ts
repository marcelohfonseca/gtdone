import type { DatabaseSync } from 'node:sqlite';

export type Migration = {
	version: number;
	name: string;
	// Recriar tabelas referenciadas exige desligar chaves estrangeiras fora da transação.
	foreignKeys?: false;
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
	},
	{
		version: 2,
		name: 'project-outcomes',
		up: (db) => {
			db.exec("ALTER TABLE projects ADD COLUMN desired_outcome TEXT NOT NULL DEFAULT '';");
		}
	},
	{
		version: 3,
		name: 'later-project-states-and-item-history',
		foreignKeys: false,
		up: (db) => {
			db.exec(`
				CREATE TABLE projects_new (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL,
					desired_outcome TEXT NOT NULL DEFAULT '',
					notes TEXT NOT NULL DEFAULT '',
					state TEXT NOT NULL DEFAULT 'active'
						CHECK (state IN ('active', 'later', 'scheduled', 'someday', 'completed', 'trash')),
					area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
					starts_at INTEGER,
					due_at INTEGER,
					position INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL,
					completed_at INTEGER
				);
				INSERT INTO projects_new (
					id, name, desired_outcome, notes, state, area_id, position,
					created_at, updated_at, completed_at
				)
				SELECT
					id, name, desired_outcome, notes, state, area_id, position,
					created_at, updated_at, completed_at
				FROM projects;

				CREATE TABLE items_new (
					id INTEGER PRIMARY KEY,
					kind TEXT NOT NULL DEFAULT 'task'
						CHECK (kind IN ('task', 'reference')),
					title TEXT NOT NULL,
					notes TEXT NOT NULL DEFAULT '',
					state TEXT NOT NULL DEFAULT 'inbox'
						CHECK (state IN ('inbox', 'next', 'later', 'waiting', 'scheduled', 'someday', 'trash', 'completed')),
					previous_state TEXT
						CHECK (previous_state IN ('inbox', 'next', 'later', 'waiting', 'scheduled', 'someday')),
					due_at INTEGER,
					starts_at INTEGER,
					energy TEXT CHECK (energy IN ('low', 'medium', 'high')),
					minutes INTEGER,
					starred INTEGER NOT NULL DEFAULT 0,
					project_id INTEGER REFERENCES projects(id),
					area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
					delegated_to_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
					position INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL,
					completed_at INTEGER
				);
				INSERT INTO items_new (
					id, kind, title, notes, state, due_at, starts_at, energy, minutes, starred,
					project_id, area_id, delegated_to_id, position, created_at, updated_at, completed_at
				)
				SELECT
					id, kind, title, notes, state, due_at, starts_at, energy, minutes, starred,
					project_id, area_id, delegated_to_id, position, created_at, updated_at, completed_at
				FROM items;

				DROP TABLE items;
				DROP TABLE projects;
				ALTER TABLE projects_new RENAME TO projects;
				ALTER TABLE items_new RENAME TO items;

				CREATE INDEX idx_items_state ON items(state);
				CREATE INDEX idx_items_project ON items(project_id);
				CREATE INDEX idx_items_area ON items(area_id);
				CREATE INDEX idx_items_due ON items(due_at);
				CREATE INDEX idx_items_starts ON items(starts_at);
				CREATE INDEX idx_items_starred ON items(starred);
				CREATE INDEX idx_projects_state ON projects(state);
				CREATE INDEX idx_projects_area ON projects(area_id);
			`);
		}
	},
	{
		version: 4,
		name: 'project-execution-mode',
		up: (db) => {
			db.exec(
				"ALTER TABLE projects ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'parallel' CHECK (execution_mode IN ('parallel', 'sequential'));"
			);
		}
	},
	{
		version: 5,
		name: 'goals',
		up: (db) => {
			db.exec(`
				CREATE TABLE goals (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL,
					description TEXT NOT NULL DEFAULT '',
					status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'archived')),
					due_at INTEGER,
					completed_at INTEGER,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				);
				CREATE TABLE goal_links (
					id INTEGER PRIMARY KEY,
					goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
					item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
					project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
					created_at INTEGER NOT NULL,
					CHECK ((item_id IS NULL) != (project_id IS NULL))
				);
				CREATE UNIQUE INDEX idx_goal_links_item ON goal_links(goal_id, item_id) WHERE item_id IS NOT NULL;
				CREATE UNIQUE INDEX idx_goal_links_project ON goal_links(goal_id, project_id) WHERE project_id IS NOT NULL;
				CREATE INDEX idx_goal_links_item_rev ON goal_links(item_id);
				CREATE INDEX idx_goal_links_project_rev ON goal_links(project_id);
			`);
		}
	},
	{
		version: 6,
		name: 'kanban-boards',
		up: (db) => {
			db.exec(`
				CREATE TABLE boards (
					id INTEGER PRIMARY KEY,
					name TEXT NOT NULL,
					group_by TEXT NOT NULL DEFAULT 'state' CHECK (group_by IN ('state', 'project', 'area', 'custom')),
					project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
					position INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL,
					updated_at INTEGER NOT NULL
				);
				CREATE TABLE board_columns (
					id INTEGER PRIMARY KEY,
					board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
					name TEXT NOT NULL,
					state_key TEXT,
					position INTEGER NOT NULL DEFAULT 0
				);
				CREATE INDEX idx_board_columns_board ON board_columns(board_id, position);
				CREATE TABLE board_cards (
					board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
					item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
					column_id INTEGER NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
					PRIMARY KEY (board_id, item_id)
				);
				CREATE INDEX idx_board_cards_column ON board_cards(column_id);
			`);
		}
	},
	{
		version: 7,
		name: 'area-color',
		up: (db) => {
			db.exec('ALTER TABLE areas ADD COLUMN color TEXT;');
		}
	},
	{
		version: 8,
		name: 'tag-contact-color',
		up: (db) => {
			db.exec('ALTER TABLE tags ADD COLUMN color TEXT; ALTER TABLE contacts ADD COLUMN color TEXT;');
		}
	},
	{
		version: 9,
		name: 'goal-area',
		up: (db) => {
			db.exec('ALTER TABLE goals ADD COLUMN area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL;');
		}
	}
];

export function runMigrations(db: DatabaseSync, targetVersion = Number.POSITIVE_INFINITY): void {
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
		if (applied.has(m.version) || m.version > targetVersion) continue;
		const rebuildsTables = m.foreignKeys === false;
		if (rebuildsTables) db.exec('PRAGMA foreign_keys = OFF;');
		db.exec('BEGIN;');
		try {
			m.up(db);
			if (rebuildsTables && db.prepare('PRAGMA foreign_key_check').all().length > 0) {
				throw new Error(`a migração ${m.version} violou chaves estrangeiras`);
			}
			db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
				m.version,
				m.name,
				now
			);
			db.exec('COMMIT;');
		} catch (err) {
			db.exec('ROLLBACK;');
			throw err;
		} finally {
			if (rebuildsTables) db.exec('PRAGMA foreign_keys = ON;');
		}
	}
}

export function currentVersion(db: DatabaseSync): number {
	const row = db
		.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations')
		.get() as { v: number };
	return Number(row.v);
}
