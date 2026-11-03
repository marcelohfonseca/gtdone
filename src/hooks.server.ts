import { redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { getDb } from '#lib/server/db.ts';
import { loadPreferences } from '#lib/gtd/preferences.ts';
import { getSession } from '#lib/auth/sessions.ts';
import { SESSION_COOKIE } from '#lib/auth/constants.ts';
import { log } from '#lib/server/log.ts';
import type { Session } from '#lib/auth/sessions.ts';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE) ?? '';
	const db = getDb();
	const session: Session | null = token ? getSession(db, token) : null;
	event.locals.session = session;

	// O webhook de email não usa sessão: autentica por token próprio na própria rota.
	if (event.url.pathname === '/api/inbound-email') return resolve(event);
	const prefs = loadPreferences(db);
	const isPublic = event.url.pathname === '/setup' || event.url.pathname === '/login';
	if (!session && !isPublic) {
		const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
		redirect(303, Number(c) === 0 ? '/setup' : '/login');
	}
	if (session && isPublic) {
		redirect(303, '/');
	}

	// Aplica idioma, tema e densidade já no HTML do servidor, sem depender da hidratação.
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace(
				'<html lang="en">',
				`<html lang="${prefs.lang}" data-theme="${prefs.theme}" data-accent="${prefs.accent}" data-density="${prefs.density}">`
			)
	});
};

export const handleError: HandleServerError = ({ error, event }) => {
	// Só método, rota e mensagem: nada de corpo da requisição nem dados privados.
	log('error', 'request.error', {
		method: event.request.method,
		path: event.url.pathname,
		message: error instanceof Error ? error.message : 'erro desconhecido'
	});
};
