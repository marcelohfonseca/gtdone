import type { DatabaseSync } from 'node:sqlite';
import { hashPassword, verifyPassword } from './password.ts';
import { createSession } from './sessions.ts';

export type AccountResult =
	| { ok: true; userId: number; token: string }
	| { ok: false; reason: string };

export function setupAccount(db: DatabaseSync, email: string, password: string): AccountResult {
	if (typeof email !== 'string' || email.trim().length === 0 || !email.includes('@')) {
		return { ok: false, reason: 'email inválido' };
	}
	if (typeof password !== 'string' || password.length < 8) {
		return { ok: false, reason: 'senha deve ter pelo menos 8 caracteres' };
	}
	const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
	if (Number(existing.c) > 0) {
		return { ok: false, reason: 'conta já existe' };
	}
	const now = Date.now();
	const hash = hashPassword(password);
	db.exec('BEGIN;');
	try {
		const result = db
			.prepare('INSERT INTO users (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)')
			.run(email.toLowerCase().trim(), hash, now, now);
		const userId = Number(result.lastInsertRowid);
		const token = createSession(db, userId);
		db.exec('COMMIT;');
		return { ok: true, userId, token };
	} catch (err) {
		db.exec('ROLLBACK;');
		throw err;
	}
}

export function authenticate(db: DatabaseSync, email: string, password: string): AccountResult {
	if (typeof email !== 'string' || typeof password !== 'string') {
		return { ok: false, reason: 'credenciais inválidas' };
	}
	const row = db
		.prepare('SELECT id, password_hash FROM users WHERE email = ?')
		.get(email.toLowerCase().trim()) as
		| { id: number; password_hash: string }
		| undefined;
	if (!row || !verifyPassword(password, row.password_hash)) {
		return { ok: false, reason: 'credenciais inválidas' };
	}
	const token = createSession(db, Number(row.id));
	return { ok: true, userId: Number(row.id), token };
}
