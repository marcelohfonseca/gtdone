import { describe, expect, it } from 'vitest';
import { TIME_FILTER_OPTIONS, TIME_OPTIONS, minutesLabel } from './format.ts';

describe('estimativas de tempo', () => {
	it('oferece a escala de estimativas solicitada', () => {
		expect(TIME_OPTIONS.map((o) => o.value)).toEqual([
			5, 15, 30, 60, 120, 240, 1440, 2880, 4320, 10080, 20160, 30240
		]);
		expect(TIME_OPTIONS.map((o) => o.label)).toEqual([
			'5 min', '15 min', '30 min', '1 h', '2 h', '4 h', '1 d', '2 d', '3 d', '1 wk', '2 wk', '3+ wk'
		]);
	});

	it('formata novas, antigas e localizadas estimativas', () => {
		expect(minutesLabel(1440)).toBe('1 d');
		expect(minutesLabel(30240)).toBe('3+ wk');
		expect(minutesLabel(10)).toBe('10 min');
		expect(minutesLabel(45)).toBe('45 min');
		expect(minutesLabel(480)).toBe('8 h');
		expect(minutesLabel(10080, 'en-US')).toBe('1 wk');
	});

	it('mantém opções antigas e limites próprios para filtro de tempo', () => {
		expect(TIME_FILTER_OPTIONS.map((o) => o.value)).toContain(10);
		expect(TIME_FILTER_OPTIONS.map((o) => o.value)).toContain(45);
		expect(TIME_FILTER_OPTIONS.map((o) => o.value)).toContain(480);
		expect(TIME_FILTER_OPTIONS.find((o) => o.value === 30240)?.label).toBe('3 wk');
	});
});
