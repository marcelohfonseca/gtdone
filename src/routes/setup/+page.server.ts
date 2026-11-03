import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '#lib/server/db.ts';
import { setupAccount } from '#lib/auth/account.ts';
import { setSessionCookie } from '#lib/server/session-cookie.ts';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.session) throw redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '');
		const password = String(data.get('password') ?? '');
		const result = setupAccount(getDb(), email, password);
		if (!result.ok) {
			return fail(400, { error: result.reason, email });
		}
		setSessionCookie(cookies, url, result.token);
		throw redirect(303, '/');
	}
};
