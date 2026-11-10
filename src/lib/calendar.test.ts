import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '#lib/db/migrations.ts';
import { captureItem, listCalendarItems, listGanttItems } from '#lib/gtd/items.ts';
import { CAL_VIEWS, buildEvents, calendarRange, dayKey, parseDay, parseMode, parseView, scheduleBucket, shiftAnchor } from './calendar.ts';

const d = (y: number, m: number, day: number) => Date.UTC(y, m - 1, day);
const today = d(2026, 11, 4); // quarta-feira

describe('calendarRange', () => {
	it('semana começa na segunda ou no domingo', () => {
		const mon = calendarRange('week', today, today, 1);
		expect(dayKey(mon.days[0])).toBe('2026-11-02');
		expect(dayKey(mon.to!)).toBe('2026-11-08');
		expect(dayKey(calendarRange('week', today, today, 0).days[0])).toBe('2026-11-01');
	});
	it('3 dias e 7 dias a partir da âncora', () => {
		expect(calendarRange('3days', d(2026, 11, 10), today, 1).days).toHaveLength(3);
		const n7 = calendarRange('next7', today, today, 1);
		expect(n7.days).toHaveLength(7);
		expect(n7.days[0]).toBe(today);
		expect(n7.days[6]).toBe(d(2026, 11, 10));
		expect(dayKey(n7.from!)).toBe('2026-11-04');
		expect(dayKey(n7.to!)).toBe('2026-11-10');
		const next = calendarRange('next7', shiftAnchor('next7', today, 1), today, 1);
		expect(dayKey(next.from!)).toBe('2026-11-11');
		expect(dayKey(next.to!)).toBe('2026-11-17');
	});
	it('mês cobre semanas completas', () => {
		const m = calendarRange('month', today, today, 1);
		expect(m.days.length % 7).toBe(0);
		expect(dayKey(m.days[0])).toBe('2026-10-26');
		expect(dayKey(m.to!)).toBe('2026-12-06');
		expect(dayKey(m.month!.last)).toBe('2026-11-30');
	});
	it('prazos não tem limites', () => {
		expect(calendarRange('deadlines', today, today, 1)).toMatchObject({ from: null, to: null, days: [] });
	});
	it('navega por 3 dias, semana e mês', () => {
		expect(dayKey(shiftAnchor('3days', today, 1))).toBe('2026-11-07');
		expect(dayKey(shiftAnchor('week', today, -1))).toBe('2026-10-28');
		expect(dayKey(shiftAnchor('month', d(2026, 12, 20), 1))).toBe('2027-01-01');
		expect(dayKey(shiftAnchor('next7', today, 1))).toBe('2026-11-11');
	});
	it('valida visão e data', () => {
		expect(parseView('x')).toBe('week');
		expect(parseView('month')).toBe('month');
		expect(parseDay('2026-02-30')).toBeNull();
		expect(parseDay('2026-02-28')).toBe(d(2026, 2, 28));
	});
});

describe('buildEvents', () => {
	const items = [
		{ id: 1, dueAt: d(2026, 11, 1), startsAt: null },
		{ id: 2, dueAt: d(2026, 11, 5), startsAt: d(2026, 11, 4) },
		{ id: 3, dueAt: null, startsAt: d(2026, 10, 1) }
	];
	it('separa atrasados nas visões de lista e ignora inícios passados', () => {
		const r = buildEvents(items, calendarRange('next7', today, today, 1), today);
		expect(r.overdue.map((e) => e.item.id)).toEqual([1]);
		expect([...r.byDay.values()].flat().map((e) => `${e.item.id}${e.kind}`).sort()).toEqual(['2due', '2start']);
	});
	it('mostra eventos da faixa anterior de 7 dias nas datas correspondentes', () => {
		const anchor = shiftAnchor('next7', today, -1);
		const r = buildEvents(items, calendarRange('next7', anchor, today, 1), today);
		expect(r.overdue).toHaveLength(0);
		expect(r.byDay.get(d(2026, 11, 1))?.map((e) => e.item.id)).toEqual([1]);
	});
	it('na grade, mostra só o que cai no intervalo', () => {
		const r = buildEvents(items, calendarRange('3days', today, today, 1), today);
		expect(r.overdue).toHaveLength(0);
		expect([...r.byDay.keys()].map(dayKey).sort()).toEqual(['2026-11-04', '2026-11-05']);
	});
});

describe('listCalendarItems', () => {
	const db = new DatabaseSync(':memory:');
	runMigrations(db);
	const add = (title: string, extra: Record<string, unknown> = {}) =>
		captureItem(db, { title, state: 'next', ...extra }, today);
	add('sem data');
	add('atrasado', { dueAt: d(2026, 11, 1) });
	add('hoje', { dueAt: today });
	add('mês que vem', { dueAt: d(2026, 12, 15) });
	add('agendado', { state: 'scheduled', startsAt: d(2026, 11, 20) });
	const done = add('concluído', { dueAt: today });
	db.prepare("UPDATE items SET state = 'completed' WHERE id = ?").run(done);
	const names = (items: { title: string }[]) => items.map((i) => i.title);

	it('filtra por intervalo e ignora concluídos', () => {
		expect(names(listCalendarItems(db, d(2026, 11, 2), d(2026, 11, 8), undefined, today))).toEqual(['hoje']);
		expect(names(listCalendarItems(db, d(2026, 11, 1), d(2026, 11, 30), undefined, today))).toEqual([
			'atrasado',
			'hoje',
			'agendado'
		]);
	});
	it('prazos: tudo com data, incluindo atrasados', () => {
		expect(names(listCalendarItems(db, null, null, undefined, today, true))).toEqual([
			'atrasado',
			'hoje',
			'agendado',
			'mês que vem'
		]);
	});
	it('modos: planejado só considera início; prazos só considera prazo', () => {
		expect(names(listCalendarItems(db, null, null, undefined, today, false, 1000, 'planned'))).toEqual(['agendado']);
		expect(names(listCalendarItems(db, null, null, undefined, today, false, 1000, 'deadlines'))).toEqual([
			'atrasado',
			'hoje',
			'mês que vem'
		]);
	});
	it('usa os índices de data', () => {
		const plan = db
			.prepare(
				"EXPLAIN QUERY PLAN SELECT id FROM items i WHERE (i.due_at >= 1 AND i.due_at <= 2) OR (i.starts_at >= 1 AND i.starts_at <= 2)"
			)
			.all()
			.map((r) => String(r.detail))
			.join(' ');
		expect(plan).toMatch(/idx_items_due/);
		expect(plan).toMatch(/idx_items_starts/);
	});
});

describe('modos e agrupamento de Agendadas', () => {
	const item = [{ id: 1, dueAt: d(2026, 11, 5), startsAt: d(2026, 11, 5) }];
	it('buildEvents respeita o modo', () => {
		const r = calendarRange('week', today, today, 1);
		expect([...buildEvents(item, r, today, 'planned').byDay.values()].flat().map((e) => e.kind)).toEqual(['start']);
		expect([...buildEvents(item, r, today, 'deadlines').byDay.values()].flat().map((e) => e.kind)).toEqual(['due']);
		expect(parseMode('x')).toBe('both');
		expect(parseMode('planned')).toBe('planned');
	});
	it('scheduleBucket: esta semana, próxima semana e futuras', () => {
		const t0 = d(2026, 11, 4); // quarta
		expect(scheduleBucket(d(2026, 11, 8), t0, 1)).toBe('thisWeek');
		expect(scheduleBucket(d(2026, 11, 9), t0, 1)).toBe('nextWeek');
		expect(scheduleBucket(d(2026, 11, 15), t0, 1)).toBe('nextWeek');
		expect(scheduleBucket(d(2026, 11, 16), t0, 1)).toBe('future');
		expect(scheduleBucket(d(2026, 11, 7), t0, 0)).toBe('thisWeek');
		expect(scheduleBucket(d(2026, 11, 8), t0, 0)).toBe('nextWeek');
	});
});

describe('Gantt', () => {
	it('visão cobre o mês inteiro e a ordem das visões é a esperada', () => {
		const r = calendarRange('gantt', d(2026, 11, 15), today, 1);
		expect(r.days).toHaveLength(30);
		expect(dayKey(r.days[0])).toBe('2026-11-01');
		expect(CAL_VIEWS).toEqual(['deadlines', '3days', 'next7', 'week', 'month', 'gantt']);
		expect(dayKey(shiftAnchor('gantt', d(2026, 11, 15), 1))).toBe('2026-12-01');
	});
	it('listGanttItems traz só itens com início e prazo que cruzam o intervalo', () => {
		const db = new DatabaseSync(':memory:');
		runMigrations(db);
		const add = (title: string, extra: Record<string, unknown>) => captureItem(db, { title, state: 'next', ...extra }, today);
		add('cruza', { startsAt: d(2026, 10, 25), dueAt: d(2026, 11, 3) });
		add('dentro', { startsAt: d(2026, 11, 10), dueAt: d(2026, 11, 12) });
		add('fora', { startsAt: d(2026, 12, 1), dueAt: d(2026, 12, 5) });
		add('só prazo', { dueAt: d(2026, 11, 10) });
		add('só início', { state: 'scheduled', startsAt: d(2026, 11, 10) });
		expect(listGanttItems(db, d(2026, 11, 1), d(2026, 11, 30), undefined, today).map((i) => i.title)).toEqual(['cruza', 'dentro']);
	});
});
