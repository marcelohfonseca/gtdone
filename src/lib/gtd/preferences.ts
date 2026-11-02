import type { DatabaseSync } from 'node:sqlite';
import { GtdError } from './core.ts';
import { getSetting, setSetting } from './organize.ts';

export const ACCENTS = [
	'green',
	'blue',
	'purple',
	'pink',
	'red',
	'orange',
	'yellow',
	'teal',
	'gray'
] as const;

type Def = { default: string; options: readonly string[] };

export const PREF_DEFS = {
	lang: { default: 'pt-BR', options: ['pt-BR', 'en-US'] },
	theme: { default: 'system', options: ['system', 'light', 'dark'] },
	accent: { default: 'green', options: ACCENTS },
	density: { default: 'normal', options: ['normal', 'compact'] },
	dateFormat: { default: 'dmy', options: ['dmy', 'mdy', 'ymd'] },
	weekStart: { default: 'monday', options: ['monday', 'sunday'] },
	dueDisplay: { default: 'relative', options: ['relative', 'absolute'] },
	rapidEntry: { default: 'show', options: ['show', 'hide'] },
	completedPosition: { default: 'bottom', options: ['bottom', 'inplace'] },
	reference: { default: 'show', options: ['show', 'hide'] },
	counts: { default: 'attention', options: ['attention', 'all'] },
	focusPosition: { default: 'bottom', options: ['top', 'bottom'] },
	later: { default: 'on', options: ['on', 'off'] },
	waiting: { default: 'on', options: ['on', 'off'] },
	calendar: { default: 'on', options: ['on', 'off'] },
	kanban: { default: 'on', options: ['on', 'off'] },
	sequentialSidebar: { default: 'on', options: ['on', 'off'] },
	inboxArea: { default: 'keep', options: ['keep', 'assign'] },
	unassignedUnderFilter: { default: 'hidden', options: ['hidden', 'visible'] }
} as const satisfies Record<string, Def>;

export type PrefKey = keyof typeof PREF_DEFS;
export type Preferences = { [K in PrefKey]: (typeof PREF_DEFS)[K]['options'][number] };

export const PREF_KEYS = Object.keys(PREF_DEFS) as PrefKey[];
const settingKey = (k: PrefKey) => `pref.${k}`;

export function loadPreferences(db: DatabaseSync): Preferences {
	const out: Record<string, string> = {};
	for (const k of PREF_KEYS) {
		const stored = getSetting(db, settingKey(k));
		const def = PREF_DEFS[k];
		out[k] = stored && (def.options as readonly string[]).includes(stored) ? stored : def.default;
	}
	return out as Preferences;
}

// Valores ausentes são ignorados; valores fora das opções rejeitam a gravação inteira.
export function savePreferences(db: DatabaseSync, values: Record<string, unknown>): void {
	const updates: [PrefKey, string][] = [];
	for (const k of PREF_KEYS) {
		if (values[k] === undefined || values[k] === null) continue;
		const v = String(values[k]);
		if (!(PREF_DEFS[k].options as readonly string[]).includes(v)) {
			throw new GtdError(`valor inválido para ${k}`);
		}
		updates.push([k, v]);
	}
	for (const [k, v] of updates) setSetting(db, settingKey(k), v);
}
