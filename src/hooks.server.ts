import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { getDb } from '#lib/server/db.ts';
import { getSession } from '#lib/auth/sessions.ts';
import { SESSION_COOKIE } from '#lib/auth/constants.ts';
import type { Session } from '#lib/auth/sessions.ts';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE) ?? '';
	const db = getDb();
	const session: Session | null = token ? getSession(db, token) : null;
	event.locals.session = session;

	const isPublic = event.url.pathname === '/setup' || event.url.pathname === '/login';
	if (!session && !isPublic) {
		const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
		redirect(303, Number(c) === 0 ? '/setup' : '/login');
	}
	if (session && isPublic) {
		redirect(303, '/');
	}

	return resolve(event);
};
