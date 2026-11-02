// Fonte única dos atalhos: o manipulador no layout e a tela de ajuda leem daqui.
export const GO_KEYS: Record<string, string> = {
	'1': '/inbox',
	'2': '/next',
	'3': '/later',
	'4': '/waiting',
	'5': '/scheduled',
	'6': '/someday',
	'7': '/focus',
	'8': '/projects',
	'9': '/reference',
	'0': '/logbook'
};

export const SHORTCUTS: { keys: string; label: string }[] = [
	{ keys: '1 – 9, 0', label: 'Ir para Entrada, Próximas, Depois, Aguardando, Agendadas, Algum dia, Foco, Projetos, Referência, Diário' },
	{ keys: 'I X L W S Y F', label: 'Criar ação em Entrada, Próximas, Depois, Aguardando, Agendadas, Algum dia, Foco' },
	{ keys: 'P', label: 'Criar projeto' },
	{ keys: 'G', label: 'Criar tag' },
	{ keys: '/', label: 'Buscar' },
	{ keys: 'J / K', label: 'Selecionar o próximo / anterior item da lista' },
	{ keys: 'Enter', label: 'Abrir ou fechar o editor do item selecionado' },
	{ keys: 'C', label: 'Concluir o item selecionado' },
	{ keys: '*', label: 'Marcar ou desmarcar Foco no item selecionado' },
	{ keys: 'T', label: 'Editar as tags do item selecionado' },
	{ keys: 'D', label: 'Duplicar o item selecionado' },
	{ keys: 'Delete', label: 'Enviar o item selecionado para a lixeira' },
	{ keys: '?', label: 'Mostrar esta ajuda' },
	{ keys: 'Esc', label: 'Fechar diálogos e menus' }
];
