import { fail } from '@sveltejs/kit';
import { GtdError } from '#lib/gtd/core.ts';
import {
	digestStatus,
	generateInboundToken,
	getAllowedSenders,
	hasInboundToken,
	loadDigestConfig,
	revokeInboundToken,
	saveDigestConfig,
	sendDigestNow,
	setAllowedSenders
} from '#lib/gtd/integrations.ts';
import { getSetting, setSetting } from '#lib/gtd/organize.ts';
import { importData, parseExport } from '#lib/gtd/portability.ts';
import { savePreferences } from '#lib/gtd/preferences.ts';
import { backupDatabase } from '#lib/db/backup.ts';
import { getBackupDir } from '#lib/server/backup-scheduler.ts';
import { getDb } from '#lib/server/db.ts';
import { mailerConfigured, sendMail } from '#lib/server/mailer.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export const load: PageServerLoad = () => {
	const db = getDb();
	return {
		retentionDays: Number(getSetting(db, 'logbook.retentionDays') ?? 0),
		inbound: { hasToken: hasInboundToken(db), senders: getAllowedSenders(db) },
		digest: { config: loadDigestConfig(db), status: digestStatus(db), smtp: mailerConfigured() }
	};
};

type Extra = { message?: string; token?: string };

async function guarded(ev: RequestEvent, section: string, fn: (fd: FormData) => Promise<Extra | void> | Extra | void) {
	try {
		const extra = (await fn(await ev.request.formData())) ?? {};
		return { ok: true as const, section, message: extra.message ?? '', token: extra.token ?? '', error: '' };
	} catch (e) {
		if (e instanceof GtdError) {
			return fail(e.status, { ok: false as const, section, message: '', token: '', error: e.message });
		}
		throw e;
	}
}

async function readImport(fd: FormData): Promise<unknown> {
	const file = fd.get('file');
	if (!(file instanceof File) || file.size === 0) throw new GtdError('escolha um arquivo de exportação');
	if (file.size > MAX_IMPORT_BYTES) throw new GtdError('arquivo grande demais');
	return parseExport(await file.text());
}

export const actions: Actions = {
	save: (ev) =>
		guarded(ev, 'prefs', (fd) => {
			const values: Record<string, unknown> = {};
			fd.forEach((v, k) => {
				if (k !== 'retentionDays') values[k] = v;
			});
			const db = getDb();
			if (fd.has('retentionDays')) {
				const days = Number(fd.get('retentionDays'));
				if (!Number.isInteger(days) || days < 0 || days > 3650) {
					throw new GtdError('informe um número de dias entre 0 e 3650');
				}
				setSetting(db, 'logbook.retentionDays', String(days));
			}
			savePreferences(db, values);
		}),
	validateImport: (ev) =>
		guarded(ev, 'import', async (fd) => {
			const summary = importData(getDb(), await readImport(fd), { dryRun: true });
			return { message: `Arquivo válido: ${Object.entries(summary).map(([t, n]) => `${t} ${n}`).join(', ')}.` };
		}),
	importData: (ev) =>
		guarded(ev, 'import', async (fd) => {
			if (fd.get('confirm') !== 'yes') throw new GtdError('confirme a substituição dos dados atuais');
			const payload = await readImport(fd);
			const db = getDb();
			importData(db, payload, { dryRun: true });
			backupDatabase(db, { backupDir: getBackupDir() });
			importData(db, payload);
			return { message: 'Dados importados. Um backup do estado anterior foi criado.' };
		}),
	genToken: (ev) => guarded(ev, 'email', () => ({ token: generateInboundToken(getDb()) })),
	revokeToken: (ev) => guarded(ev, 'email', () => revokeInboundToken(getDb())),
	saveSenders: (ev) =>
		guarded(ev, 'email', (fd) => {
			setAllowedSenders(getDb(), fd.get('senders'));
		}),
	saveDigest: (ev) =>
		guarded(ev, 'digest', (fd) => {
			saveDigestConfig(getDb(), {
				enabled: fd.get('enabled') === 'on',
				days: fd.getAll('days'),
				time: fd.get('time'),
				to: fd.get('to')
			});
		}),
	sendDigest: (ev) =>
		guarded(ev, 'digest', async () => {
			try {
				await sendDigestNow(getDb(), sendMail);
			} catch (e) {
				if (e instanceof GtdError) throw e;
				throw new GtdError(`falha ao enviar: ${e instanceof Error ? e.message : 'erro'}`, 502);
			}
			return { message: 'Email de teste enviado.' };
		})
};
