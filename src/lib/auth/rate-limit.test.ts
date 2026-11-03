import { beforeEach, describe, expect, it } from 'vitest';
import { LOCK_MS, MAX_FAILURES, WINDOW_MS, recordFailure, recordSuccess, resetRateLimits, retryAfterMs } from './rate-limit.ts';

describe('limite de tentativas de login', () => {
	beforeEach(resetRateLimits);

	it('bloqueia após o máximo de falhas e libera depois do período', () => {
		const t = 1_000_000;
		for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('ip', t + i);
		expect(retryAfterMs('ip', t + 10)).toBe(0);
		recordFailure('ip', t + 10);
		expect(retryAfterMs('ip', t + 11)).toBeGreaterThan(0);
		expect(retryAfterMs('ip', t + 10 + LOCK_MS)).toBe(0);
	});

	it('falhas antigas saem da janela e o sucesso zera a contagem', () => {
		for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('a', 0);
		recordFailure('a', WINDOW_MS + 1);
		expect(retryAfterMs('a', WINDOW_MS + 2)).toBe(0);
		for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('b', 0);
		recordSuccess('b');
		recordFailure('b', 1);
		expect(retryAfterMs('b', 2)).toBe(0);
	});
});
