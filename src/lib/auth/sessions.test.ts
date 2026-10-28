import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, closeDatabase, type Database } from '../db/client.ts';
import { createSession, getSession, deleteSession, deleteExpiredSessions } from './sessions.ts';
import { setupAccount, authenticate } from './account.ts';

function freshDb(): Database {
	return openDatabase(join(mkdtempSync(join(tmpdir(), 'gtdone-auth-')), 'test.db'));
}

describe('sessões', () => {
	it('cria e recupera sessão válida', () => {
		const db = freshDb();
		try {
			const account = setupAccount(db, 'eu@exemplo.com', 'senha1111');
			expect(account.ok).toBe(true);
			if (!account.ok) return;
			const token = createSession(db, account.userId);
			const session = getSession(db, token);
			expect(session).not.toBeNull();
			expect(session?.user_id).toBe(account.userId);
		} finally {
			closeDatabase(db);
		}
	});

	it('rejeita token inexistente ou vazio', () => {
		const db = freshDb();
		try {
			expect(getSession(db, 'nao-existe')).toBeNull();
			expect(getSession(db, '')).toBeNull();
		} finally {
			closeDatabase(db);
		}
	});

	it('expira sessão após o prazo', () => {
		const db = freshDb();
		try {
			const account = setupAccount(db, 'eu@exemplo.com', 'senha1111');
			if (!account.ok) return;
			const token = createSession(db, account.userId, -1000); // já expirada
			expect(getSession(db, token)).toBeNull();
		} finally {
			closeDatabase(db);
		}
	});

	it('deleteSession remove a sessão', () => {
		const db = freshDb();
		try {
			const account = setupAccount(db, 'eu@exemplo.com', 'senha1111');
			if (!account.ok) return;
			const token = createSession(db, account.userId);
			expect(deleteSession(db, token)).toBe(true);
			expect(getSession(db, token)).toBeNull();
			expect(deleteSession(db, token)).toBe(false);
		} finally {
			closeDatabase(db);
		}
	});

	it('deleteExpiredSessions remove apenas as expiradas', () => {
		const db = freshDb();
		try {
			const account = setupAccount(db, 'eu@exemplo.com', 'senha1111');
			if (!account.ok) return;
			const expired = createSession(db, account.userId, -1000);
			const valid = createSession(db, account.userId, 60000);
			const removed = deleteExpiredSessions(db);
			expect(removed).toBe(1);
			expect(getSession(db, expired)).toBeNull();
			expect(getSession(db, valid)).not.toBeNull();
		} finally {
			closeDatabase(db);
		}
	});
});

describe('conta', () => {
	it('cria a primeira conta e já retorna sessão', () => {
		const db = freshDb();
		try {
			const result = setupAccount(db, 'eu@exemplo.com', 'senha1111');
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			const session = getSession(db, result.token);
			expect(session).not.toBeNull();
		} finally {
			closeDatabase(db);
		}
	});

	it('não permite segunda conta', () => {
		const db = freshDb();
		try {
			setupAccount(db, 'eu@exemplo.com', 'senha1111');
			const again = setupAccount(db, 'outro@exemplo.com', 'senha2222');
			expect(again.ok).toBe(false);
		} finally {
			closeDatabase(db);
		}
	});

	it('valida email e rejeita senha curta', () => {
		const db = freshDb();
		try {
			expect(setupAccount(db, 'sem-arroba', 'senha1111').ok).toBe(false);
			expect(setupAccount(db, 'eu@exemplo.com', 'curta').ok).toBe(false);
		} finally {
			closeDatabase(db);
		}
	});

	it('autentica com credenciais e falha com as erradas', () => {
		const db = freshDb();
		try {
			setupAccount(db, 'Eu@Exemplo.com', 'senha1111');
			const ok = authenticate(db, 'eu@exemplo.com', 'senha1111');
			expect(ok.ok).toBe(true);
			const wrongPassword = authenticate(db, 'eu@exemplo.com', 'erradas');
			expect(wrongPassword.ok).toBe(false);
			expect(wrongPassword).toEqual({ ok: false, reason: 'credenciais inválidas' });
			const wrongEmail = authenticate(db, 'outro@exemplo.com', 'senha1111');
			expect(wrongEmail.ok).toBe(false);
		} finally {
			closeDatabase(db);
		}
	});
});
