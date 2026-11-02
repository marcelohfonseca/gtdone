// Quick Add: extrai $área, @contexto, !urgência, data e recorrência de uma frase.
// Baseado em regras, síncrono e sem dependências externas. Datas são meia-noite UTC (ms),
// o mesmo formato usado pelo restante do app.

export type Urgency = 'high' | 'medium' | 'low';
export type Recurrence = { unit: 'daily' | 'weekly' | 'monthly' | 'yearly'; every: number };

export type QuickAddOptions = {
	/** Meia-noite UTC do dia atual (use startOfTodayUtc()). */
	today: number;
	/** Ordem de dia/mês em datas numéricas como 03/04. Padrão: 'dmy'. */
	dateOrder?: 'dmy' | 'mdy';
	/** Se informado, "$nome" só é consumido quando existir uma área com esse nome. */
	areas?: string[];
};

export type QuickAddToken = { kind: 'area' | 'context' | 'urgency' | 'date' | 'recurrence'; raw: string };

export type QuickAddResult = {
	title: string;
	area: string | null;
	contexts: string[];
	urgency: Urgency | null;
	dueAt: number | null;
	recurrence: Recurrence | null;
	tokens: QuickAddToken[];
};

type Ctx = { today: number; dateOrder: 'dmy' | 'mdy' };
type Unit = 'd' | 'w' | 'm' | 'y';

const DAY = 86_400_000;
const START = String.raw`(?<![\p{L}\p{N}_])`;
const END = String.raw`(?![\p{L}\p{N}_])`;

const norm = (s: string) =>
	s
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[_-]+/g, ' ')
		.trim();

const MONTHS: Record<string, number> = {
	janeiro: 1, jan: 1, january: 1,
	fevereiro: 2, fev: 2, february: 2, feb: 2,
	marco: 3, mar: 3, march: 3,
	abril: 4, abr: 4, april: 4, apr: 4,
	maio: 5, mai: 5, may: 5,
	junho: 6, jun: 6, june: 6,
	julho: 7, jul: 7, july: 7,
	agosto: 8, ago: 8, august: 8, aug: 8,
	setembro: 9, set: 9, september: 9, sep: 9, sept: 9,
	outubro: 10, out: 10, october: 10, oct: 10,
	novembro: 11, nov: 11, november: 11,
	dezembro: 12, dez: 12, december: 12, dec: 12
};
const MONTH_RE = Object.keys(MONTHS)
	.sort((a, b) => b.length - a.length)
	.map((m) => (m === 'marco' ? 'mar[cç]o' : m))
	.join('|');

// 0 = domingo.
const WEEKDAYS: Record<string, number> = {
	domingo: 0, sunday: 0, sun: 0,
	segunda: 1, monday: 1, mon: 1,
	terca: 2, tuesday: 2, tue: 2, tues: 2,
	quarta: 3, wednesday: 3, wed: 3,
	quinta: 4, thursday: 4, thu: 4, thur: 4, thurs: 4,
	sexta: 5, friday: 5, fri: 5,
	sabado: 6, saturday: 6, sat: 6
};
const WD_FULL = String.raw`(?:domingo|segunda(?:[- ]feira)?|ter[cç]a(?:[- ]feira)?|quarta(?:[- ]feira)?|quinta(?:[- ]feira)?|sexta(?:[- ]feira)?|s[áa]bado|sunday|monday|tuesday|wednesday|thursday|friday|saturday)`;
const WD_ABBR = String.raw`(?:sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)`;

const UNIT: Record<string, Unit> = {
	dia: 'd', dias: 'd', day: 'd', days: 'd',
	semana: 'w', semanas: 'w', week: 'w', weeks: 'w',
	mes: 'm', meses: 'm', month: 'm', months: 'm',
	ano: 'y', anos: 'y', year: 'y', years: 'y'
};
const UNIT_RE = String.raw`(?:dias?|semanas?|m[êe]s(?:es)?|anos?|days?|weeks?|months?|years?)`;
const RECUR_UNIT: Record<Unit, Recurrence['unit']> = { d: 'daily', w: 'weekly', m: 'monthly', y: 'yearly' };

// Conectores que antecedem uma data e saem junto com ela ("para amanhã", "by friday").
const LEAD = String.raw`(?:(?:para|pra|at[ée]|no|na|em|antes\s+de|by|on|until|due|before)\s+)?`;

function ymd(y: number, m: number, d: number): number | null {
	const ms = Date.UTC(y, m - 1, d);
	const dt = new Date(ms);
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? ms : null;
}

function addMonths(ms: number, n: number): number {
	const d = new Date(ms);
	const target = d.getUTCMonth() + n;
	const last = new Date(Date.UTC(d.getUTCFullYear(), target + 1, 0)).getUTCDate();
	return Date.UTC(d.getUTCFullYear(), target, Math.min(d.getUTCDate(), last));
}

function addUnit(ms: number, n: number, unit: Unit): number {
	if (unit === 'd') return ms + n * DAY;
	if (unit === 'w') return ms + n * 7 * DAY;
	return addMonths(ms, unit === 'm' ? n : n * 12);
}

function nextWeekday(today: number, wd: number, strict: boolean): number {
	let diff = (wd - new Date(today).getUTCDay() + 7) % 7;
	if (diff === 0 && strict) diff = 7;
	return today + diff * DAY;
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

// Dia/mês sem ano: este ano, ou o próximo se já passou.
function dayMonth(today: number, m: number, d: number): number | null {
	const y = new Date(today).getUTCFullYear();
	const cur = ymd(y, m, d);
	return cur != null && cur >= today ? cur : ymd(y + 1, m, d);
}

function numericDate(a: number, b: number, year: number | null, c: Ctx): number | null {
	const [d, mo] = c.dateOrder === 'mdy' ? [b, a] : [a, b];
	return year == null ? dayMonth(c.today, mo, d) : ymd(fullYear(year), mo, d);
}

type Out = { date?: number; recurrence?: Recurrence };
type Rule = { re: RegExp; run: (m: RegExpExecArray, c: Ctx) => Out | null };

const wdIndex = (raw: string) => WEEKDAYS[norm(raw).replace(/ feira$/, '')];
const monthIndex = (raw: string) => MONTHS[norm(raw)];
const unitOf = (raw: string) => UNIT[norm(raw)];
const rxLead = (src: string) => new RegExp(`${START}${LEAD}${src}${END}`, 'iu');
const date = (d: number | null): Out | null => (d == null ? null : { date: d });

// Ordem importa: padrões mais específicos primeiro.
const RECURRENCE_RULES: Rule[] = [
	{
		// "toda segunda", "every monday"
		re: rxLead(String.raw`(?:toda|todas\s+as|todo|todos\s+os|every)\s+(${WD_FULL})`),
		run: (m, c) => ({ recurrence: { unit: 'weekly', every: 1 }, date: nextWeekday(c.today, wdIndex(m[1]), false) })
	},
	{
		// "a cada 2 semanas", "every 3 days"
		re: rxLead(String.raw`(?:a\s+cada|every)\s+(\d{1,3})\s*(${UNIT_RE})`),
		run: (m) => (Number(m[1]) < 1 ? null : { recurrence: { unit: RECUR_UNIT[unitOf(m[2])], every: Number(m[1]) } })
	},
	{
		re: rxLead(String.raw`(?:todos\s+os\s+dias|todo\s+dia|diariamente|every\s*day|daily)`),
		run: () => ({ recurrence: { unit: 'daily', every: 1 } })
	},
	{
		re: rxLead(String.raw`(?:toda\s+semana|semanalmente|every\s*week|weekly)`),
		run: () => ({ recurrence: { unit: 'weekly', every: 1 } })
	},
	{
		re: rxLead(String.raw`(?:todo\s+m[êe]s|mensalmente|every\s*month|monthly)`),
		run: () => ({ recurrence: { unit: 'monthly', every: 1 } })
	},
	{
		re: rxLead(String.raw`(?:todo\s+ano|anualmente|every\s*year|yearly|annually)`),
		run: () => ({ recurrence: { unit: 'yearly', every: 1 } })
	}
];

const DATE_RULES: Rule[] = [
	{
		// 2026-03-15
		re: rxLead(String.raw`(\d{4})-(\d{1,2})-(\d{1,2})`),
		run: (m) => date(ymd(Number(m[1]), Number(m[2]), Number(m[3])))
	},
	{
		// 15/03/2026, 15-03-26, 15.03.2026 (com "dia" opcional)
		re: rxLead(String.raw`(?:dia\s+)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})`),
		run: (m, c) => date(numericDate(Number(m[1]), Number(m[2]), Number(m[3]), c))
	},
	{
		// 15/03 (sem ano)
		re: rxLead(String.raw`(?:dia\s+)?(\d{1,2})/(\d{1,2})`),
		run: (m, c) => date(numericDate(Number(m[1]), Number(m[2]), null, c))
	},
	{
		// 15 de março [de 2026], 15 mar, 15th of March
		re: rxLead(String.raw`(?:dia\s+)?(\d{1,2})(?:st|nd|rd|th|º)?\s*(?:de\s+|of\s+)?(${MONTH_RE})(?:\s*(?:de|,)?\s*(\d{4}))?`),
		run: (m, c) => {
			const mo = monthIndex(m[2]);
			return date(m[3] ? ymd(Number(m[3]), mo, Number(m[1])) : dayMonth(c.today, mo, Number(m[1])));
		}
	},
	{
		// March 15, mar 15th [2026]
		re: rxLead(String.raw`(${MONTH_RE})\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?`),
		run: (m, c) => {
			const mo = monthIndex(m[1]);
			return date(m[3] ? ymd(Number(m[3]), mo, Number(m[2])) : dayMonth(c.today, mo, Number(m[2])));
		}
	},
	{
		// "dia 15", "on the 15th": próximo dia do mês que ainda não passou
		re: rxLead(String.raw`(?:dia\s+(\d{1,2})|the\s+(\d{1,2})(?:st|nd|rd|th))`),
		run: (m, c) => {
			const day = Number(m[1] ?? m[2]);
			const t = new Date(c.today);
			for (let i = 0; i < 12; i++) {
				const r = ymd(t.getUTCFullYear(), t.getUTCMonth() + 1 + i, day);
				if (r != null && r >= c.today) return { date: r };
			}
			return null;
		}
	},
	{
		re: rxLead(String.raw`depois\s+de\s+amanh[ãa]|day\s+after\s+tomorrow`),
		run: (_m, c) => ({ date: c.today + 2 * DAY })
	},
	{
		re: rxLead(String.raw`amanh[ãa]|tomorrow|tmrw`),
		run: (_m, c) => ({ date: c.today + DAY })
	},
	{
		re: rxLead(String.raw`hoje|today|tonight|esta\s+noite`),
		run: (_m, c) => ({ date: c.today })
	},
	{
		re: rxLead(String.raw`ontem|yesterday`),
		run: (_m, c) => ({ date: c.today - DAY })
	},
	{
		// +3d, +2w, +1m, +1y
		re: new RegExp(String.raw`${START}\+(\d{1,3})([dwmy])${END}`, 'iu'),
		run: (m, c) => ({ date: addUnit(c.today, Number(m[1]), m[2].toLowerCase() as Unit) })
	},
	{
		// em 3 dias, daqui a 2 semanas, in 5 days
		re: rxLead(String.raw`(?:em|daqui\s+a|dentro\s+de|in|within)\s+(\d{1,3})\s+(${UNIT_RE})`),
		run: (m, c) => ({ date: addUnit(c.today, Number(m[1]), unitOf(m[2])) })
	},
	{
		// em uma semana, in a week, daqui a um mês
		re: rxLead(String.raw`(?:em|daqui\s+a|dentro\s+de|in)\s+(?:uma?|an?)\s+(${UNIT_RE})`),
		run: (m, c) => ({ date: addUnit(c.today, 1, unitOf(m[1])) })
	},
	{
		// semana que vem / next week → segunda-feira seguinte
		re: rxLead(String.raw`(?:semana\s+que\s+vem|pr[óo]xima\s+semana|next\s+week)`),
		run: (_m, c) => ({ date: nextWeekday(c.today, 1, true) })
	},
	{
		re: rxLead(String.raw`(?:m[êe]s\s+que\s+vem|pr[óo]ximo\s+m[êe]s|next\s+month)`),
		run: (_m, c) => ({ date: addMonths(c.today, 1) })
	},
	{
		re: rxLead(String.raw`(?:fim\s+do\s+m[êe]s|final\s+do\s+m[êe]s|end\s+of\s+(?:the\s+)?month)`),
		run: (_m, c) => {
			const d = new Date(c.today);
			return { date: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) };
		}
	},
	{
		re: rxLead(String.raw`(?:(?:este\s+|neste\s+|this\s+)?fim\s+de\s+semana|(?:this\s+)?weekend)`),
		run: (_m, c) => ({ date: nextWeekday(c.today, 6, false) })
	},
	{
		// próxima segunda / segunda que vem / next monday: estritamente depois de hoje
		re: rxLead(String.raw`(?:(?:pr[óo]xim[ao]|next)\s+(${WD_FULL}|${WD_ABBR})|(${WD_FULL})\s+que\s+vem)`),
		run: (m, c) => ({ date: nextWeekday(c.today, wdIndex(m[1] ?? m[2]), true) })
	},
	{
		// segunda, friday; abreviações em inglês exigem on/by/this
		re: rxLead(String.raw`(?:(?:this\s+)?(${WD_FULL})|(?:on|by|this)\s+(${WD_ABBR}))`),
		run: (m, c) => ({ date: nextWeekday(c.today, wdIndex(m[1] ?? m[2]), false) })
	}
];

function firstMatch(text: string, rules: Rule[], c: Ctx) {
	for (const rule of rules) {
		const m = rule.re.exec(text);
		const out = m && rule.run(m, c);
		if (m && out) return { index: m.index, length: m[0].length, raw: m[0], ...out };
	}
	return null;
}

const URGENCY: Record<string, Urgency> = {
	alta: 'high', alto: 'high', urgente: 'high', high: 'high', urgent: 'high', p1: 'high', '1': 'high',
	media: 'medium', medio: 'medium', normal: 'medium', medium: 'medium', p2: 'medium', '2': 'medium',
	baixa: 'low', baixo: 'low', low: 'low', p3: 'low', '3': 'low'
};

// Marcadores só valem no início da frase ou após espaço (ignora e-mails e "R$10").
const SIGIL = String.raw`(?<![^\s])`;

/**
 * Interpreta frases como "Ligar para João amanhã @telefone $Trabalho !alta".
 * Nunca lança: o que não for reconhecido permanece no título.
 */
export function parseQuickAdd(input: string, options: QuickAddOptions): QuickAddResult {
	const ctx: Ctx = { today: options.today, dateOrder: options.dateOrder ?? 'dmy' };
	const original = String(input ?? '');
	let text = original;
	const tokens: QuickAddToken[] = [];
	const cut = (index: number, length: number) => {
		text = `${text.slice(0, index)} ${text.slice(index + length)}`;
	};

	// $área: $Trabalho, $"Casa e Família"
	let area: string | null = null;
	const known = options.areas?.map((a) => [norm(a), a] as const);
	const areaRe = new RegExp(String.raw`${SIGIL}\$(?:"([^"]+)"|(\p{L}[\p{L}\p{N}_-]*))`, 'gu');
	for (const m of text.matchAll(areaRe)) {
		const name = (m[1] ?? m[2]).trim();
		const hit = known ? known.find(([n]) => n === norm(name))?.[1] : name;
		if (hit == null) continue;
		area = hit;
		tokens.push({ kind: 'area', raw: m[0] });
		cut(m.index, m[0].length);
		break;
	}

	// @contexto: @telefone, @"em casa"; vários permitidos, sem repetição
	const contexts: string[] = [];
	const ctxRe = new RegExp(String.raw`${SIGIL}@(?:"([^"]+)"|([\p{L}\p{N}][\p{L}\p{N}_-]*))`, 'gu');
	for (const m of [...text.matchAll(ctxRe)].reverse()) {
		const name = (m[1] ?? m[2]).trim();
		if (!contexts.some((c) => c.toLowerCase() === name.toLowerCase())) contexts.unshift(name);
		tokens.push({ kind: 'context', raw: m[0] });
		cut(m.index, m[0].length);
	}

	// !urgência: !alta, !urgente, !p1, !1, !!, !!!
	let urgency: Urgency | null = null;
	const urgRe = new RegExp(String.raw`${SIGIL}!(!{1,2}|[\p{L}\p{N}]+)${END}`, 'gu');
	for (const m of text.matchAll(urgRe)) {
		const level: Urgency | undefined = m[1].startsWith('!') ? 'high' : URGENCY[norm(m[1])];
		if (!level) continue;
		urgency = level;
		tokens.push({ kind: 'urgency', raw: m[0] });
		cut(m.index, m[0].length);
		break;
	}

	// Recorrência primeiro (pode trazer a própria data), depois a data avulsa.
	let dueAt: number | null = null;
	let recurrence: Recurrence | null = null;
	const rec = firstMatch(text, RECURRENCE_RULES, ctx);
	if (rec) {
		recurrence = rec.recurrence ?? null;
		dueAt = rec.date ?? null;
		tokens.push({ kind: 'recurrence', raw: rec.raw });
		cut(rec.index, rec.length);
	}
	const dt = firstMatch(text, DATE_RULES, ctx);
	if (dt?.date != null) {
		dueAt = dt.date;
		tokens.push({ kind: 'date', raw: dt.raw });
		cut(dt.index, dt.length);
	}
	if (recurrence && dueAt == null) dueAt = ctx.today;

	const title = text
		.replace(/\s+/g, ' ')
		.replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '')
		.trim();
	if (!title) {
		// Só havia marcadores: mantém a frase original como título e ignora o parsing.
		return { title: original.trim(), area: null, contexts: [], urgency: null, dueAt: null, recurrence: null, tokens: [] };
	}
	return { title, area, contexts, urgency, dueAt, recurrence, tokens };
}
