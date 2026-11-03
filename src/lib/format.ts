import { daysBetween, parseRecurrence, toDateInput } from '#lib/gtd/core.ts';
import { translate } from '#lib/i18n/index.ts';

export const TIME_OPTIONS = [
	{ value: 5, label: '5 min' },
	{ value: 10, label: '10 min' },
	{ value: 15, label: '15 min' },
	{ value: 30, label: '30 min' },
	{ value: 45, label: '45 min' },
	{ value: 60, label: '1 h' },
	{ value: 120, label: '2 h' },
	{ value: 240, label: '4 h' },
	{ value: 480, label: '8 h' }
];

export const ENERGY_LABEL = { low: 'Baixa', medium: 'Média', high: 'Alta' } as const;

export type DateFormat = 'dmy' | 'mdy' | 'ymd';

export function formatDay(ms: number, format: DateFormat = 'dmy'): string {
	const [y, m, d] = toDateInput(ms).split('-');
	if (format === 'mdy') return `${m}/${d}/${y}`;
	if (format === 'ymd') return `${y}-${m}-${d}`;
	return `${d}/${m}/${y}`;
}

export function dueInfo(
	due: number | null,
	today: number,
	opts: { format?: DateFormat; absolute?: boolean; lang?: string } = {}
): { text: string; late: boolean } | null {
	if (due == null) return null;
	const diff = daysBetween(today, due);
	if (opts.absolute) return { text: formatDay(due, opts.format), late: diff < 0 };
	const t = (text: string, n?: number) => translate(opts.lang ?? 'pt-BR', text, n == null ? undefined : { n });
	if (diff < 0) return { text: t(diff === -1 ? '{n} dia de atraso' : '{n} dias de atraso', -diff), late: true };
	if (diff === 0) return { text: t('Hoje'), late: false };
	if (diff === 1) return { text: t('Amanhã'), late: false };
	return { text: formatDay(due, opts.format), late: false };
}

export function minutesLabel(m: number | null): string {
	if (m == null) return '';
	return m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`;
}

// Só http(s): evita javascript: e afins; vírgula/pontuação final não entram no link.
export function extractLinks(text: string): string[] {
	const found = text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
	return [...new Set(found.map((u) => u.replace(/[.,;:!?)\]]+$/, '')))];
}

export function linkHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

const WEEKDAYS_LABEL = {
	'pt-BR': ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
	'en-US': ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};

export function recurrenceLabel(raw: string | null, lang = 'pt-BR'): string {
	if (!raw) return '';
	const rule = parseRecurrence(raw);
	if (!rule) return '';
	const { unit, every } = rule;
	const en = lang === 'en-US';
	const names: Record<string, [string, string, string, string]> = {
		daily: ['dia', 'dias', 'day', 'days'],
		weekly: ['semana', 'semanas', 'week', 'weeks'],
		monthly: ['mês', 'meses', 'month', 'months'],
		yearly: ['ano', 'anos', 'year', 'years']
	};
	const [one, many, enOne, enMany] = names[unit];
	let text: string;
	if (en) text = every === 1 ? `Every ${enOne}` : `Every ${every} ${enMany}`;
	else if (every !== 1) text = `A cada ${every} ${many}`;
	else text = `${unit === 'weekly' ? 'Toda' : 'Todo'} ${one}`;
	const labels = WEEKDAYS_LABEL[en ? 'en-US' : 'pt-BR'];
	if (rule.weekdays?.length) text += ` (${rule.weekdays.map((d) => labels[d]).join(', ')})`;
	if (rule.after) text += en ? ' · after completion' : ' · após a conclusão';
	if (rule.until != null) text += en ? ` · until ${toDateInput(rule.until)}` : ` · até ${toDateInput(rule.until)}`;
	if (rule.count != null) text += en ? ` · ${rule.count} more` : ` · mais ${rule.count}`;
	return text;
}


type TextItem = {
	title: string;
	notes: string;
	state: string;
	kind: string;
	dueAt: number | null;
	projectName: string | null;
	contactName: string | null;
	tags: string[];
	checklist: { title: string; done: boolean }[];
};

// Texto simples (markdown leve) para colar em outros apps.
export function itemsAsText(items: TextItem[], format: DateFormat = 'dmy', lang = 'pt-BR'): string {
	const en = lang === 'en-US';
	return items
		.map((i) => {
			const box = i.kind === 'reference' ? '-' : i.state === 'completed' ? '- [x]' : '- [ ]';
			const meta = [
				i.contactName && `${en ? 'with' : 'com'} ${i.contactName}`,
				i.projectName && `${en ? 'project' : 'projeto'}: ${i.projectName}`,
				i.dueAt != null && `${en ? 'due' : 'prazo'}: ${formatDay(i.dueAt, format)}`,
				...i.tags.map((t) => `#${t}`)
			].filter(Boolean);
			const lines = [`${box} ${i.title}${meta.length ? ` (${meta.join(' · ')})` : ''}`];
			if (i.notes.trim()) lines.push(...i.notes.trim().split('\n').map((l) => `    ${l}`));
			for (const c of i.checklist) lines.push(`    ${c.done ? '- [x]' : '- [ ]'} ${c.title}`);
			return lines.join('\n');
		})
		.join('\n');
}

// Em http (fora de localhost) navigator.clipboard não existe; cai para execCommand.
export async function copyText(text: string): Promise<boolean> {
	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		/* tenta o plano B */
	}
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.style.position = 'fixed';
	ta.style.opacity = '0';
	document.body.appendChild(ta);
	ta.select();
	const ok = document.execCommand('copy');
	ta.remove();
	return ok;
}
