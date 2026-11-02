import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quick-add.ts';

const today = Date.UTC(2026, 10, 2); // segunda-feira
const d = (y: number, m: number, day: number) => Date.UTC(y, m - 1, day);
const p = (s: string, o = {}) => parseQuickAdd(s, { today, ...o });

describe('parseQuickAdd: marcadores', () => {
	it('extrai área, contextos e urgência', () => {
		const r = p('Ligar para o João $Trabalho @telefone @"em casa" !alta');
		expect(r).toMatchObject({ title: 'Ligar para o João', area: 'Trabalho', contexts: ['telefone', 'em casa'], urgency: 'high' });
	});
	it('aceita níveis de urgência alternativos', () => {
		expect(p('x !p2').urgency).toBe('medium');
		expect(p('x !baixa').urgency).toBe('low');
		expect(p('x !!').urgency).toBe('high');
		expect(p('x !urgent').urgency).toBe('high');
	});
	it('ignora e-mails, preços e marcadores desconhecidos', () => {
		const r = p('Enviar para ana@x.com R$10 !talvez');
		expect(r).toMatchObject({ title: 'Enviar para ana@x.com R$10 !talvez', area: null, contexts: [], urgency: null });
	});
	it('só consome $área que existe quando a lista é informada', () => {
		const areas = ['Casa e Família', 'Trabalho'];
		expect(p('Pagar conta $casa-e-família', { areas }).area).toBe('Casa e Família');
		const r = p('Custa $outra coisa', { areas });
		expect(r.area).toBeNull();
		expect(r.title).toBe('Custa $outra coisa');
	});
	it('mantém a frase se só houver marcadores', () => {
		expect(p('amanhã').title).toBe('amanhã');
		expect(p('amanhã').dueAt).toBeNull();
	});
});

describe('parseQuickAdd: datas', () => {
	const cases: [string, number][] = [
		['Pagar conta hoje', today],
		['Pagar conta amanhã', d(2026, 11, 3)],
		['Pagar conta depois de amanhã', d(2026, 11, 4)],
		['Pay bill tomorrow', d(2026, 11, 3)],
		['Pagar em 3 dias', d(2026, 11, 5)],
		['Pagar daqui a 2 semanas', d(2026, 11, 16)],
		['Pay in 2 months', d(2027, 1, 2)],
		['Pagar em uma semana', d(2026, 11, 9)],
		['Pagar +3d', d(2026, 11, 5)],
		['Pagar sexta', d(2026, 11, 6)],
		['Pagar segunda', today],
		['Pagar próxima segunda', d(2026, 11, 9)],
		['Pagar quarta-feira que vem', d(2026, 11, 4)],
		['Pay next friday', d(2026, 11, 6)],
		['Pay by fri', d(2026, 11, 6)],
		['Pagar semana que vem', d(2026, 11, 9)],
		['Pagar mês que vem', d(2026, 12, 2)],
		['Pagar fim do mês', d(2026, 11, 30)],
		['Pagar fim de semana', d(2026, 11, 7)],
		['Pagar 15/11', d(2026, 11, 15)],
		['Pagar 01/11', d(2027, 11, 1)],
		['Pagar dia 20/12/2026', d(2026, 12, 20)],
		['Pagar 5-3-27', d(2027, 3, 5)],
		['Pagar 2026-12-25', d(2026, 12, 25)],
		['Pagar 15 de março de 2027', d(2027, 3, 15)],
		['Pagar 10 dez', d(2026, 12, 10)],
		['Pay March 3rd 2027', d(2027, 3, 3)],
		['Pay on the 20th', d(2026, 11, 20)],
		['Pagar dia 1', d(2026, 12, 1)],
		['Pagar dia 10', d(2026, 11, 10)]
	];
	it.each(cases)('%s', (text, expected) => {
		const r = p(text);
		expect(r.dueAt).toBe(expected);
		expect(r.title).toMatch(/^(Pagar|Pay)( conta| bill)?$/);
	});
	it('remove conectores junto da data', () => {
		expect(p('Entregar relatório até sexta').title).toBe('Entregar relatório');
		expect(p('Entregar relatório no dia 15/11').title).toBe('Entregar relatório');
	});
	it('respeita a ordem mês/dia', () => {
		expect(p('Pay 11/15', { dateOrder: 'mdy' }).dueAt).toBe(d(2026, 11, 15));
	});
	it('ignora datas inválidas', () => {
		const r = p('Pagar 31/02/2026');
		expect(r.dueAt).toBeNull();
	});
});

describe('parseQuickAdd: recorrência', () => {
	it('toda segunda', () => {
		const r = p('Reunião toda terça');
		expect(r.recurrence).toEqual({ unit: 'weekly', every: 1 });
		expect(r.dueAt).toBe(d(2026, 11, 3));
		expect(r.title).toBe('Reunião');
	});
	it('a cada N unidades e diário sem data', () => {
		expect(p('Regar plantas a cada 2 semanas').recurrence).toEqual({ unit: 'weekly', every: 2 });
		const r = p('Tomar vitamina todo dia');
		expect(r.recurrence).toEqual({ unit: 'daily', every: 1 });
		expect(r.dueAt).toBe(today);
	});
	it('every month with explicit date', () => {
		const r = p('Pay rent every month 05/12');
		expect(r.recurrence).toEqual({ unit: 'monthly', every: 1 });
		expect(r.dueAt).toBe(d(2026, 12, 5));
	});
});
