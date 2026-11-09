import { describe, expect, it } from 'vitest';
import { parseFocusView, parseItemGrouping } from './list-view.ts';

describe('agrupamento das listas Próximas e Depois', () => {
	it('usa Projeto por padrão e para valores inválidos', () => {
		expect(parseItemGrouping(null)).toBe('project');
		expect(parseItemGrouping('unknown')).toBe('project');
	});

	it('aceita os modos de agrupamento suportados', () => {
		expect(parseItemGrouping('project')).toBe('project');
		expect(parseItemGrouping('context')).toBe('context');
		expect(parseItemGrouping('time')).toBe('time');
		expect(parseItemGrouping('energy')).toBe('energy');
	});
});

describe('visualizações de Foco', () => {
	it('usa Ambos por padrão e para valores inválidos', () => {
		expect(parseFocusView(null)).toBe('both');
		expect(parseFocusView('unknown')).toBe('both');
	});

	it('aceita Ambos, Estrelado e Vencido', () => {
		expect(parseFocusView('both')).toBe('both');
		expect(parseFocusView('starred')).toBe('starred');
		expect(parseFocusView('overdue')).toBe('overdue');
	});
});
