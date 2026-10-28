import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '#lib/server/db.ts';
import { authenticate } from '#lib/auth/account.ts';
import { SESSION_COOKIE, SESSION_MAX_AGE_S } from '#lib/auth/constants.ts';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.session) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '');
		const password = String(data.get('password') ?? '');
		const result = authenticate(getDb(), email, password);
		if (!result.ok) {
			return fail(400, { error: result.reason, email });
		}
		cookies.set(SESSION_COOKIE, result.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE_S
		});
		throw redirect(303, '/');
	}
};
