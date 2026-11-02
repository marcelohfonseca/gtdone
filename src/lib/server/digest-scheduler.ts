import type { Database } from '#lib/db/client.ts';
import { runDigestTick } from '#lib/gtd/integrations.ts';
import { mailerConfigured, sendMail } from './mailer.ts';

export function ensureDigestScheduler(db: Database): void {
	const runtime = globalThis as typeof globalThis & { __gtdoneDigestTimer?: NodeJS.Timeout };
	if (runtime.__gtdoneDigestTimer) return;
	let running = false;
	runtime.__gtdoneDigestTimer = setInterval(async () => {
		if (running || !mailerConfigured()) return;
		running = true;
		try {
			const r = await runDigestTick(db, new Date(), sendMail);
			if (r === 'failed') console.error('[GTDone] Falha ao enviar o email do Foco (ver Preferências).');
		} catch (e) {
			console.error('[GTDone] Erro no agendador do email do Foco:', e);
		} finally {
			running = false;
		}
	}, 60_000);
	runtime.__gtdoneDigestTimer.unref();
}
