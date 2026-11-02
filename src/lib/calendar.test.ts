import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '#lib/db/migrations.ts';
import { captureItem, listCalendarItems } from '#lib/gtd/items.ts';
import { buildEvents, calendarRange, dayKey, parseDay, parseView, shiftAnchor } from './calendar.ts';

const d = (y: number, m: number, day: number) => Date.UTC(y, m - 1, day);
const today = d(2026, 11, 4); // quarta-feira

describe('calendarRange', () => {
	it('semana começa na segunda ou no domingo', () => {
		const mon = calendarRange('week', today, today, 1);
		expect(dayKey(mon.days[0])).toBe('2026-11-02');
		expect(dayKey(mon.to!)).toBe('2026-11-08');
		expect(dayKey(calendarRange('week', today, today, 0).days[0])).toBe('2026-11-01');
	});
	it('3 dias e 7 dias a partir de hoje', () => {
		expect(calendarRange('3days', d(2026, 11, 10), today, 1).days).toHaveLength(3);
		const n7 = calendarRange('next7', d(2030, 1, 1), today, 1);
		expect(dayKey(n7.from!)).toBe('2026-11-04');
		expect(dayKey(n7.to!)).toBe('2026-11-10');
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
		expect(shiftAnchor('next7', today, 1)).toBe(today);
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
