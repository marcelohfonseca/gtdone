import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { GtdError, startOfTodayUtc } from './core.ts';
import { captureItem, listItems, NO_FILTER } from './items.ts';
import { getSetting, setSetting } from './organize.ts';

const K = {
	tokenHash: 'integration.inbound.tokenHash',
	senders: 'integration.inbound.senders',
	digest: 'integration.digest.config',
	attempt: 'integration.digest.attempt',
	lastSent: 'integration.digest.lastSent'
};

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const sha256 = (v: string) => createHash('sha256').update(v).digest();

// ---------- Captura por email ----------

// O token só é mostrado na geração; o banco guarda apenas o hash.
export function generateInboundToken(db: DatabaseSync): string {
	const token = randomBytes(32).toString('base64url');
	setSetting(db, K.tokenHash, sha256(token).toString('hex'));
	return token;
}

export function hasInboundToken(db: DatabaseSync): boolean {
	return getSetting(db, K.tokenHash) != null;
}

export function revokeInboundToken(db: DatabaseSync): void {
	db.prepare('DELETE FROM settings WHERE key = ?').run(K.tokenHash);
}

export function verifyInboundToken(db: DatabaseSync, token: string): boolean {
	const stored = getSetting(db, K.tokenHash);
	if (!stored || !token) return false;
	const a = sha256(token);
	const b = Buffer.from(stored, 'hex');
	return a.length === b.length && timingSafeEqual(a, b);
}

export function parseSender(from: unknown): string | null {
	const raw = String(from ?? '').trim();
	const angle = raw.match(/<([^<>\s]+)>/);
	const email = (angle ? angle[1] : raw).toLowerCase();
	return EMAIL_RE.test(email) ? email : null;
}

export function getAllowedSenders(db: DatabaseSync): string[] {
	return (getSetting(db, K.senders) ?? '').split(',').filter(Boolean);
}

export function setAllowedSenders(db: DatabaseSync, input: unknown): string[] {
	const parts = String(input ?? '')
		.split(/[\s,;]+/)
		.filter(Boolean);
	const list: string[] = [];
	for (const p of parts) {
		const email = parseSender(p);
		if (!email) throw new GtdError(`email inválido: ${p}`);
		if (!list.includes(email)) list.push(email);
	}
	if (list.length > 50) throw new GtdError('no máximo 50 remetentes');
	setSetting(db, K.senders, list.join(','));
	return list;
}

export type InboundEmail = { from: unknown; subject: unknown; text: unknown };

// Sem remetentes cadastrados nada é aceito (padrão seguro).
export function captureFromEmail(db: DatabaseSync, mail: InboundEmail, today = startOfTodayUtc()): number {
	const sender = parseSender(mail.from);
	if (!sender || !getAllowedSenders(db).includes(sender)) {
		throw new GtdError('remetente não autorizado', 403);
	}
	const subject = String(mail.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
	const notes = String(mail.text ?? '').trim().slice(0, 20_000);
	return captureItem(db, { title: subject || '(sem assunto)', notes, state: 'inbox' }, today);
}

// ---------- Email periódico da lista Focus ----------

export type DigestConfig = { enabled: boolean; days: number[]; time: string; to: string };
export const DEFAULT_DIGEST: DigestConfig = { enabled: false, days: [1, 2, 3, 4, 5], time: '08:00', to: '' };
export const MAX_DIGEST_ATTEMPTS = 3;
export const DIGEST_RETRY_MS = 15 * 60_000;

export function loadDigestConfig(db: DatabaseSync): DigestConfig {
	const raw = getSetting(db, K.digest);
	if (!raw) return { ...DEFAULT_DIGEST };
	try {
		return { ...DEFAULT_DIGEST, ...(JSON.parse(raw) as Partial<DigestConfig>) };
	} catch {
		return { ...DEFAULT_DIGEST };
	}
}

export function saveDigestConfig(db: DatabaseSync, input: Partial<Record<keyof DigestConfig, unknown>>): DigestConfig {
	const days = [...new Set((Array.isArray(input.days) ? input.days : []).map(Number))].sort();
	if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new GtdError('dia da semana inválido');
	const time = String(input.time ?? '');
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new GtdError('horário inválido (use HH:MM)');
	const to = String(input.to ?? '').trim().toLowerCase();
	const enabled = input.enabled === true;
	if (enabled && !EMAIL_RE.test(to)) throw new GtdError('informe um email de destino válido');
	if (enabled && days.length === 0) throw new GtdError('escolha ao menos um dia da semana');
	const cfg: DigestConfig = { enabled, days, time, to };
	setSetting(db, K.digest, JSON.stringify(cfg));
	return cfg;
}

export function digestStatus(db: DatabaseSync): { lastSent: string | null; error: string | null; attempts: number } {
	const a = readAttempt(db);
	return { lastSent: getSetting(db, K.lastSent), error: a?.error ?? null, attempts: a?.count ?? 0 };
}

type Attempt = { date: string; count: number; at: number; error: string };
function readAttempt(db: DatabaseSync): Attempt | null {
	const raw = getSetting(db, K.attempt);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as Attempt;
	} catch {
		return null;
	}
}

const dayKey = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function buildDigest(db: DatabaseSync, today: number): { subject: string; text: string; count: number } {
	const items = listItems(db, 'focus', NO_FILTER, today);
	const lines = items.map((i) => {
		const late = i.dueAt != null && i.dueAt < today ? ' (atrasada)' : '';
		const project = i.projectName ? ` — ${i.projectName}` : '';
		return `• ${i.title}${project}${late}`;
	});
	return {
		subject: `GTDone · Foco de hoje (${items.length})`,
		text: `Seu Foco:\n\n${lines.join('\n')}\n`,
		count: items.length
	};
}

export type Mail = { to: string; subject: string; text: string };
export type DigestResult = 'sent' | 'empty' | 'skipped' | 'failed';

// Política: no máximo 3 tentativas por dia, espaçadas de 15 min; o erro fica visível nas preferências.
export async function runDigestTick(
	db: DatabaseSync,
	now: Date,
	send: (mail: Mail) => Promise<void>
): Promise<DigestResult> {
	const cfg = loadDigestConfig(db);
	if (!cfg.enabled || !cfg.days.includes(now.getDay())) return 'skipped';
	const today = dayKey(now);
	const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
	if (hhmm < cfg.time || getSetting(db, K.lastSent) === today) return 'skipped';
	const prev = readAttempt(db);
	if (prev?.date === today && (prev.count >= MAX_DIGEST_ATTEMPTS || now.getTime() - prev.at < DIGEST_RETRY_MS)) {
		return 'skipped';
	}
	const digest = buildDigest(db, startOfTodayUtc(now.getTime()));
	if (digest.count === 0) {
		setSetting(db, K.lastSent, today);
		return 'empty';
	}
	try {
		await send({ to: cfg.to, subject: digest.subject, text: digest.text });
		setSetting(db, K.lastSent, today);
		db.prepare('DELETE FROM settings WHERE key = ?').run(K.attempt);
		return 'sent';
	} catch (e) {
		const count = prev?.date === today ? prev.count + 1 : 1;
		const error = (e instanceof Error ? e.message : 'erro desconhecido').slice(0, 300);
		setSetting(db, K.attempt, JSON.stringify({ date: today, count, at: now.getTime(), error }));
		return 'failed';
	}
}

// Envio imediato (botão "enviar agora"): não consome a cota do dia.
export async function sendDigestNow(db: DatabaseSync, send: (mail: Mail) => Promise<void>, now = new Date()) {
	const cfg = loadDigestConfig(db);
	if (!EMAIL_RE.test(cfg.to)) throw new GtdError('configure o email de destino primeiro');
	const d = buildDigest(db, startOfTodayUtc(now.getTime()));
	await send({ to: cfg.to, subject: d.subject, text: d.count ? d.text : 'Seu Foco está vazio.\n' });
}
