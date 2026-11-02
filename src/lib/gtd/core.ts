export class GtdError extends Error {
	status: number;
	constructor(message: string, status = 400) {
		super(message);
		this.status = status;
	}
}

const DAY = 86_400_000;

// Datas são guardadas como meia-noite UTC (ms) do dia escolhido.
export function startOfTodayUtc(now = Date.now()): number {
	const d = new Date(now);
	return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseDateInput(value: unknown): number | null {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
	if (!m) throw new GtdError('data inválida');
	const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	if (new Date(ms).getUTCMonth() !== Number(m[2]) - 1) throw new GtdError('data inválida');
	return ms;
}

export function toDateInput(ms: number | null): string {
	return ms == null ? '' : new Date(ms).toISOString().slice(0, 10);
}

export function daysBetween(from: number, to: number): number {
	return Math.round((to - from) / DAY);
}

export const RECURRENCE_UNITS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];
export type Recurrence = { unit: RecurrenceUnit; every: number };

// Formato guardado: "weekly:2" (a cada 2 semanas). Vazio = sem recorrência.
export function parseRecurrence(value: unknown): Recurrence | null {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	const [unit, n] = raw.split(':');
	const every = Number(n ?? 1);
	if (
		!(RECURRENCE_UNITS as readonly string[]).includes(unit) ||
		!Number.isInteger(every) ||
		every < 1 ||
		every > 365
	) {
		throw new GtdError('recorrência inválida');
	}
	return { unit: unit as RecurrenceUnit, every };
}

// Soma meses preservando o último dia do mês quando o dia não existe (31/jan + 1 mês = 28/fev).
export function advanceDate(ms: number, rule: Recurrence): number {
	const d = new Date(ms);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	const day = d.getUTCDate();
	if (rule.unit === 'daily') return ms + rule.every * DAY;
	if (rule.unit === 'weekly') return ms + rule.every * 7 * DAY;
	const months = rule.unit === 'monthly' ? rule.every : rule.every * 12;
	const target = m + months;
	const last = new Date(Date.UTC(y + Math.floor(target / 12), (target % 12) + 1, 0)).getUTCDate();
	return Date.UTC(y + Math.floor(target / 12), target % 12, Math.min(day, last));
}

export const LISTS = [
	'inbox',
	'next',
	'later',
	'waiting',
	'scheduled',
	'someday',
	'focus',
	'logbook',
	'trash'
] as const;
export type ListName = (typeof LISTS)[number];

export const STATE_LISTS = ['inbox', 'next', 'later', 'waiting', 'scheduled', 'someday'] as const;
export type StateList = (typeof STATE_LISTS)[number];

export const LIST_META: Record<
	ListName,
	{ label: string; subtitle: string; icon: string; empty: string }
> = {
	inbox: {
		label: 'Caixa de entrada',
		subtitle: 'Capture tudo aqui e esclareça depois.',
		icon: '📥',
		empty: 'Caixa vazia. Capture o que está na sua cabeça.'
	},
	next: {
		label: 'Próximas',
		subtitle: 'Ações prontas para fazer assim que possível.',
		icon: '▶',
		empty: 'Nenhuma próxima ação.'
	},
	later: {
		label: 'Depois',
		subtitle: 'Ações que você fará, mas não agora.',
		icon: '⏭',
		empty: 'Nada para depois.'
	},
	waiting: {
		label: 'Aguardando',
		subtitle: 'Delegadas ou dependentes de outra pessoa.',
		icon: '⏳',
		empty: 'Nada aguardando ninguém.'
	},
	scheduled: {
		label: 'Agendadas',
		subtitle: 'Tudo o que tem data: inícios e prazos.',
		icon: '📅',
		empty: 'Nenhuma ação agendada.'
	},
	someday: {
		label: 'Algum dia',
		subtitle: 'Ideias e desejos sem compromisso.',
		icon: '💭',
		empty: 'Nenhuma ideia guardada.'
	},
	focus: {
		label: 'Foco',
		subtitle: 'O que você marcou com estrela.',
		icon: '★',
		empty: 'Marque ações com estrela para focar nelas.'
	},
	logbook: {
		label: 'Diário',
		subtitle: 'Ações e projetos concluídos.',
		icon: '✔',
		empty: 'Nada concluído ainda.'
	},
	trash: {
		label: 'Lixeira',
		subtitle: 'Itens excluídos; restaure se precisar.',
		icon: '🗑',
		empty: 'Lixeira vazia.'
	}
};

export function isList(value: string): value is ListName {
	return (LISTS as readonly string[]).includes(value);
}
export function isStateList(value: string): value is StateList {
	return (STATE_LISTS as readonly string[]).includes(value);
}
