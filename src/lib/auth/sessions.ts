import type { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export function createSession(
	db: DatabaseSync,
	userId: number,
	ttlMs: number = DEFAULT_SESSION_TTL_MS
): string {
	const token = randomBytes(32).toString('hex');
	const now = Date.now();
	db.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
		token,
		userId,
		now + ttlMs,
		now
	);
	return token;
}

export type Session = {
	id: string;
	user_id: number;
	expires_at: number;
};

export function getSession(db: DatabaseSync, token: string): Session | null {
	if (typeof token !== 'string' || token.length === 0) return null;
	const row = db
		.prepare(
			'SELECT id, user_id, expires_at FROM sessions WHERE id = ? AND expires_at > ?'
		)
		.get(token, Date.now()) as Session | undefined;
	return row ?? null;
}

export function deleteSession(db: DatabaseSync, token: string): boolean {
	const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
	return Number(result.changes) > 0;
}

export function deleteExpiredSessions(db: DatabaseSync): number {
	const result = db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
	return Number(result.changes);
}
