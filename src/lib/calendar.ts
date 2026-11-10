// Lógica pura do Calendário (sem DOM/DB): intervalos de cada visão, navegação e agrupamento
// por dia. Datas são meia-noite UTC em ms, como no restante do app.

export const CAL_VIEWS = ['deadlines', '3days', 'next7', 'week', 'month', 'gantt'] as const;
export type CalView = (typeof CAL_VIEWS)[number];
export const DEFAULT_VIEW: CalView = 'week';

export const CAL_MODES = ['both', 'planned', 'deadlines'] as const;
export type CalMode = (typeof CAL_MODES)[number];

export function parseMode(v: string | null | undefined): CalMode {
	return (CAL_MODES as readonly string[]).includes(v ?? '') ? (v as CalMode) : 'both';
}

const DAY = 86_400_000;

export type ScheduleBucket = 'thisWeek' | 'nextWeek' | 'future';

// Agrupa uma data de início da lista Agendadas: esta semana, próxima semana ou datas futuras.
export function scheduleBucket(startsAt: number, today: number, weekStart: 0 | 1): ScheduleBucket {
	const thisWeekEnd = startOfWeek(today, weekStart) + 6 * DAY;
	if (startsAt <= thisWeekEnd) return 'thisWeek';
	return startsAt <= thisWeekEnd + 7 * DAY ? 'nextWeek' : 'future';
}

export type CalRange = {
	view: CalView;
	/** Dia de referência da navegação (meia-noite UTC). */
	anchor: number;
	/** Limites inclusivos para a consulta; null = sem limite (Prazos). */
	from: number | null;
	to: number | null;
	/** Dias exibidos na grade (vazio em Prazos). */
	days: number[];
	/** Primeiro e último dia do mês exibido (só na visão mensal). */
	month: { first: number; last: number } | null;
};

export function parseView(v: string | null | undefined): CalView {
	return (CAL_VIEWS as readonly string[]).includes(v ?? '') ? (v as CalView) : DEFAULT_VIEW;
}

export function parseDay(v: string | null | undefined): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? '');
	if (!m) return null;
	const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
	return new Date(ms).getUTCMonth() === +m[2] - 1 ? ms : null;
}

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function startOfWeek(ms: number, weekStart: 0 | 1): number {
	const dow = new Date(ms).getUTCDay();
	return ms - ((dow - weekStart + 7) % 7) * DAY;
}

function range(from: number, count: number): number[] {
	return Array.from({ length: count }, (_, i) => from + i * DAY);
}

export function calendarRange(view: CalView, anchor: number, today: number, weekStart: 0 | 1): CalRange {
	const base = { view, anchor, month: null } as const;
	switch (view) {
		case 'deadlines':
			return { ...base, from: null, to: null, days: [] };
		case '3days': {
			const days = range(anchor, 3);
			return { ...base, from: days[0], to: days[2], days };
		}
		case 'week': {
			const days = range(startOfWeek(anchor, weekStart), 7);
			return { ...base, from: days[0], to: days[6], days };
		}
		case 'next7': {
			const days = range(anchor, 7);
			return { ...base, from: days[0], to: days[6], days };
		}
		case 'gantt': {
			const d = new Date(anchor);
			const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
			const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
			const days = range(first, (last - first) / DAY + 1);
			return { ...base, from: first, to: last, days, month: { first, last } };
		}
		case 'month': {
			const d = new Date(anchor);
			const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
			const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
			const gridStart = startOfWeek(first, weekStart);
			const weeks = Math.ceil(((last - gridStart) / DAY + 1) / 7);
			const days = range(gridStart, weeks * 7);
			return { ...base, from: days[0], to: days[days.length - 1], days, month: { first, last } };
		}
	}
}

// Passo da navegação: 3 dias, 1 semana ou 1 mês. Agenda não navega.
export function shiftAnchor(view: CalView, anchor: number, dir: -1 | 1): number {
	if (view === '3days') return anchor + dir * 3 * DAY;
	if (view === 'week' || view === 'next7') return anchor + dir * 7 * DAY;
	if (view === 'month' || view === 'gantt') {
		const d = new Date(anchor);
		return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1);
	}
	return anchor;
}

export type CalItem = { id: number; dueAt: number | null; startsAt: number | null };
export type CalEvent<T extends CalItem> = { item: T; date: number; kind: 'due' | 'start' };

/**
 * Transforma itens em eventos (um por data: prazo e/ou início) dentro do intervalo.
 * Na Agenda e na faixa atual de 7 dias, prazos anteriores a hoje entram em `overdue`.
 */
export function buildEvents<T extends CalItem>(
	items: T[],
	r: CalRange,
	today: number,
	mode: CalMode = 'both'
): { byDay: Map<number, CalEvent<T>[]>; overdue: CalEvent<T>[] } {
	const byDay = new Map<number, CalEvent<T>[]>();
	const overdue: CalEvent<T>[] = [];
	const wantsOverdue = r.view === 'deadlines' || (r.view === 'next7' && r.anchor === today);
	const inRange = (d: number) => (r.from == null || d >= r.from) && (r.to == null || d <= r.to);
	const push = (item: T, date: number, kind: 'due' | 'start') => {
		if (kind === 'due' && date < today && wantsOverdue) return void overdue.push({ item, date, kind });
		if (kind === 'start' && wantsOverdue && date < today) return;
		if (!inRange(date)) return;
		const list = byDay.get(date) ?? [];
		list.push({ item, date, kind });
		byDay.set(date, list);
	};
	for (const it of items) {
		if (mode !== 'planned' && it.dueAt != null) push(it, it.dueAt, 'due');
		if (mode !== 'deadlines' && it.startsAt != null && (mode === 'planned' || it.startsAt !== it.dueAt)) {
			push(it, it.startsAt, 'start');
		}
	}
	overdue.sort((a, b) => a.date - b.date);
	return { byDay, overdue };
}
