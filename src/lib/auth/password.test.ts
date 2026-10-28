import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, hashPasswordAsync } from './password.ts';

describe('hashPassword', () => {
	it('gera hash no formato scrypt com salt', () => {
		const hash = hashPassword('senha-segura-123');
		const parts = hash.split(':');
		expect(parts[0]).toBe('scrypt');
		expect(parts).toHaveLength(6);
	});

	it('rejeita senha vazia', () => {
		expect(() => hashPassword('')).toThrow();
	});

	it('gera hashes diferentes para mesma senha (salts distintos)', () => {
		expect(hashPassword('abc12345')).not.toBe(hashPassword('abc12345'));
	});
});

describe('verifyPassword', () => {
	it('valida senha correta', () => {
		const hash = hashPassword('senha-segura-123');
		expect(verifyPassword('senha-segura-123', hash)).toBe(true);
	});

	it('rejeita senha errada', () => {
		const hash = hashPassword('senha-segura-123');
		expect(verifyPassword('errada', hash)).toBe(false);
	});

	it('rejeita entradas malformadas sem lançar', () => {
		expect(verifyPassword('', 'x')).toBe(false);
		expect(verifyPassword('x', '')).toBe(false);
		expect(verifyPassword('x', 'md5:abc')).toBe(false);
		expect(verifyPassword('x', 'desc')).toBe(false);
	});
});

describe('hashPasswordAsync', () => {
	it('produz hash verificável', async () => {
		const hash = await hashPasswordAsync('async-senha-9');
		expect(verifyPassword('async-senha-9', hash)).toBe(true);
	});
});
