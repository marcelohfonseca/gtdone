import { getContext, setContext } from 'svelte';
import type { Preferences } from '#lib/gtd/preferences.ts';
import { translate, translateMessage } from '#lib/i18n/index.ts';

const KEY = Symbol('prefs');

// O layout publica um getter para os componentes lerem as preferências de forma reativa.
export function providePrefs(get: () => Preferences) {
	setContext(KEY, get);
}

export function usePrefs(): () => Preferences {
	return getContext<() => Preferences>(KEY);
}

export type T = (text: string, params?: Record<string, string | number>) => string;

// Traduz um texto-fonte em português para o idioma atual; chame dentro do template para manter a reatividade.
export function useT(): T & { msg: (text: string) => string } {
	const prefs = usePrefs();
	const t = ((text: string, params?: Record<string, string | number>) =>
		translate(prefs().lang, text, params)) as T & { msg: (text: string) => string };
	t.msg = (text: string) => translateMessage(prefs().lang, text);
	return t;
}
