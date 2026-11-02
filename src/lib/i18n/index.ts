import { EN_CORE } from './en-core.ts';
import { EN_SERVER } from './en-server.ts';
import { EN_UI } from './en-ui.ts';
import { EN_SHELL } from './en-shell.ts';

export const LANGS = ['pt-BR', 'en-US'] as const;
export type Lang = (typeof LANGS)[number];

// O texto-fonte é o próprio português; en-US é um dicionário indexado por ele.
const EN: Record<string, string> = { ...EN_CORE, ...EN_SERVER, ...EN_SHELL, ...EN_UI };

export function translate(lang: Lang | string, text: string, params?: Record<string, string | number>): string {
	let out = lang === 'en-US' ? (EN[text] ?? text) : text;
	if (params) for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v));
	return out;
}

// Mensagens do servidor trazem valores variáveis ("valor inválido para x"): tenta o texto exato e depois o prefixo.
export function translateMessage(lang: Lang | string, text: string): string {
	if (lang !== 'en-US') return text;
	if (EN[text]) return EN[text];
	const i = text.indexOf(':');
	if (i > 0 && EN[`${text.slice(0, i)}:`]) return `${EN[`${text.slice(0, i)}:`]}${text.slice(i + 1)}`;
	for (const [pt, en] of Object.entries(EN_SERVER)) {
		if (pt.endsWith('…') && text.startsWith(pt.slice(0, -1))) return en.slice(0, -1) + text.slice(pt.length - 1);
	}
	return text;
}
