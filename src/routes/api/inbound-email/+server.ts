import { json } from '@sveltejs/kit';
import { GtdError } from '#lib/gtd/core.ts';
import { captureFromEmail, verifyInboundToken } from '#lib/gtd/integrations.ts';
import { getDb } from '#lib/server/db.ts';
import type { RequestHandler } from './$types';

const MAX_BODY = 256 * 1024;

const pick = (o: Record<string, unknown>, ...keys: string[]) => keys.map((k) => o[k]).find((v) => v != null);

// Aceita só JSON (isento do CSRF de formulários) nos formatos de Postmark e genérico {from, subject, text}.
export const POST: RequestHandler = async ({ request }) => {
	const auth = request.headers.get('authorization') ?? '';
	const token = auth.startsWith('Bearer ') ? auth.slice(7) : (request.headers.get('x-gtdone-token') ?? '');
	if (!verifyInboundToken(getDb(), token)) return json({ error: 'não autorizado' }, { status: 401 });
	if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
		return json({ error: 'envie application/json' }, { status: 415 });
	}
	const raw = await request.text();
	if (raw.length > MAX_BODY) return json({ error: 'mensagem grande demais' }, { status: 413 });
	let body: Record<string, unknown>;
	try {
		body = JSON.parse(raw);
		if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error();
	} catch {
		return json({ error: 'JSON inválido' }, { status: 400 });
	}
	try {
		const id = captureFromEmail(getDb(), {
			from: pick(body, 'from', 'From', 'sender'),
			subject: pick(body, 'subject', 'Subject'),
			text: pick(body, 'text', 'TextBody', 'body')
		});
		return json({ ok: true, id }, { status: 201 });
	} catch (e) {
		if (e instanceof GtdError) return json({ error: e.message }, { status: e.status });
		throw e;
	}
};
