import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export function hashPassword(password: string): string {
	if (typeof password !== 'string' || password.length === 0) {
		throw new Error('senha vazia');
	}
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, KEY_LEN, {
		N: SCRYPT_N,
		r: SCRYPT_R,
		p: SCRYPT_P,
		maxmem: 256 * 1024 * 1024
	});
	return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	if (typeof password !== 'string' || password.length === 0 || typeof stored !== 'string') {
		return false;
	}
	const parts = stored.split(':');
	if (parts.length !== 6 || parts[0] !== 'scrypt') {
		return false;
	}
	const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
	try {
		const salt = Buffer.from(saltB64, 'base64');
		const expected = Buffer.from(hashB64, 'base64');
		if (expected.length !== KEY_LEN) return false;
		const hash = scryptSync(password, salt, KEY_LEN, {
			N: Number(nStr),
			r: Number(rStr),
			p: Number(pStr),
			maxmem: 256 * 1024 * 1024
		});
		return timingSafeEqual(hash, expected);
	} catch {
		return false;
	}
}

export async function hashPasswordAsync(password: string): Promise<string> {
	// mantém a mesma assinatura assíncrona para uso em rotas SvelteKit,
	// mas usa scryptSync aqui para evitar nesting de callbacks
	return hashPassword(password);
}
