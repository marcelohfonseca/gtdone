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
export type Recurrence = {
	unit: RecurrenceUnit;
	every: number;
	/** Dias da semana (0 = domingo) em regras semanais. */
	weekdays?: number[];
	/** Conta a partir da conclusão, não da data anterior. */
	after?: boolean;
	/** Última data (meia-noite UTC) em que ainda pode ocorrer. */
	until?: number;
	/** Repetições restantes depois da ocorrência atual. */
	count?: number;
};

// Formato guardado: "weekly:2" (a cada 2 semanas) com extras opcionais separados por ";":
// "weekly:1;wd=1,3;after=1;until=2026-12-31;count=4". Vazio = sem recorrência.
export function parseRecurrence(value: unknown): Recurrence | null {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	const [head, ...extras] = raw.split(';');
	const [unit, n] = head.split(':');
	const every = Number(n ?? 1);
	if (
		!(RECURRENCE_UNITS as readonly string[]).includes(unit) ||
		!Number.isInteger(every) ||
		every < 1 ||
		every > 365
	) {
		throw new GtdError('recorrência inválida');
	}
	const rule: Recurrence = { unit: unit as RecurrenceUnit, every };
	for (const extra of extras) {
		const [key, val = ''] = extra.split('=');
		if (key === 'wd') {
			const days = [...new Set(val.split(',').filter(Boolean).map(Number))].sort();
			if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new GtdError('recorrência inválida');
			if (unit === 'weekly' && days.length) rule.weekdays = days;
		} else if (key === 'after') {
			if (val === '1') rule.after = true;
		} else if (key === 'until') {
			const until = parseDateInput(val);
			if (until != null) rule.until = until;
		} else if (key === 'count') {
			const count = Number(val);
			if (!Number.isInteger(count) || count < 0 || count > 1000) throw new GtdError('recorrência inválida');
			rule.count = count;
		} else if (key) throw new GtdError('recorrência inválida');
	}
	return rule;
}

export function serializeRecurrence(rule: Recurrence): string {
	const parts = [`${rule.unit}:${rule.every}`];
	if (rule.weekdays?.length) parts.push(`wd=${rule.weekdays.join(',')}`);
	if (rule.after) parts.push('after=1');
	if (rule.until != null) parts.push(`until=${toDateInput(rule.until)}`);
	if (rule.count != null) parts.push(`count=${rule.count}`);
	return parts.join(';');
}

// Soma meses preservando o último dia do mês quando o dia não existe (31/jan + 1 mês = 28/fev).
export function advanceDate(ms: number, rule: Recurrence): number {
	const d = new Date(ms);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	const day = d.getUTCDate();
	if (rule.unit === 'daily') return ms + rule.every * DAY;
	if (rule.unit === 'weekly') {
		const days = rule.weekdays;
		if (!days?.length) return ms + rule.every * 7 * DAY;
		const dow = d.getUTCDay();
		const later = days.find((w) => w > dow);
		if (later != null) return ms + (later - dow) * DAY;
		// semana (domingo a sábado) do dia atual + "a cada N" semanas, no primeiro dia marcado
		return ms - dow * DAY + rule.every * 7 * DAY + days[0] * DAY;
	}
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
		subtitle: '… para uma data futura.',
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
