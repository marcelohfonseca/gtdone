// Limitador de tentativas de login em memória (processo único): após MAX_FAILURES falhas
// dentro da janela, a chave fica bloqueada até o fim do período de bloqueio.
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

type Entry = { failures: number[]; lockedUntil: number };
const entries = new Map<string, Entry>();

export function retryAfterMs(key: string, now = Date.now()): number {
	const e = entries.get(key);
	return e && e.lockedUntil > now ? e.lockedUntil - now : 0;
}

export function recordFailure(key: string, now = Date.now()): void {
	const e = entries.get(key) ?? { failures: [], lockedUntil: 0 };
	e.failures = [...e.failures.filter((t) => now - t < WINDOW_MS), now];
	if (e.failures.length >= MAX_FAILURES) {
		e.lockedUntil = now + LOCK_MS;
		e.failures = [];
	}
	entries.set(key, e);
	if (entries.size > 1000) {
		for (const [k, v] of entries) if (v.lockedUntil <= now && v.failures.every((t) => now - t >= WINDOW_MS)) entries.delete(k);
	}
}

export function recordSuccess(key: string): void {
	entries.delete(key);
}

export function resetRateLimits(): void {
	entries.clear();
}
