import type { Actions } from './$types';
import { getDb } from '#lib/server/db.ts';
import { deleteSession } from '#lib/auth/sessions.ts';
import { SESSION_COOKIE } from '#lib/auth/constants.ts';

export const actions: Actions = {
	default: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE) ?? '';
		if (token) {
			deleteSession(getDb(), token);
		}
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return { ok: true };
	}
};
