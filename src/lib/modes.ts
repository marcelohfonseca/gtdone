export const MODES = [
	{ key: 'i', label: 'Ação → Caixa de entrada', kind: 'action', state: 'inbox' },
	{ key: 'x', label: 'Ação → Próximas', kind: 'action', state: 'next' },
	{ key: 'l', label: 'Ação → Depois', kind: 'action', state: 'later' },
	{ key: 'w', label: 'Ação → Aguardando', kind: 'action', state: 'waiting' },
	{ key: 's', label: 'Ação → Agendadas', kind: 'action', state: 'scheduled' },
	{ key: 'y', label: 'Ação → Algum dia', kind: 'action', state: 'someday' },
	{ key: 'f', label: 'Ação → Foco', kind: 'action', state: 'next', starred: true },
	{ key: 'p', label: 'Projeto', kind: 'project', state: '' },
	{ key: 'g', label: 'Tag', kind: 'tag', state: '' }
] as const;
export type Mode = (typeof MODES)[number];
