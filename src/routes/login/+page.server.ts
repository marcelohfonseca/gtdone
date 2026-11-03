import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '#lib/server/db.ts';
import { authenticate } from '#lib/auth/account.ts';
import { deleteExpiredSessions } from '#lib/auth/sessions.ts';
import { recordFailure, recordSuccess, retryAfterMs } from '#lib/auth/rate-limit.ts';
import { setSessionCookie } from '#lib/server/session-cookie.ts';
import { log } from '#lib/server/log.ts';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.session) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '');
		const password = String(data.get('password') ?? '');
		const ip = getClientAddress();
		const keys = [`ip:${ip}`, `email:${email.toLowerCase().trim()}`];
		const wait = Math.max(...keys.map((k) => retryAfterMs(k)));
		if (wait > 0) {
			log('warn', 'login.blocked', { ip });
			return fail(429, { error: `muitas tentativas; tente novamente em ${Math.ceil(wait / 60000)} min`, email });
		}
		const result = authenticate(getDb(), email, password);
		if (!result.ok) {
			keys.forEach((k) => recordFailure(k));
			log('warn', 'login.failed', { ip });
			return fail(400, { error: result.reason, email });
		}
		keys.forEach(recordSuccess);
		deleteExpiredSessions(getDb());
		log('info', 'login.ok', { ip });
		setSessionCookie(cookies, url, result.token);
		throw redirect(303, '/');
	}
};
