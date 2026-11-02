import { describe, expect, it } from 'vitest';
import { translate, translateMessage } from './index.ts';
import { loadPreferences, savePreferences } from '#lib/gtd/preferences.ts';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '#lib/db/migrations.ts';

describe('i18n', () => {
	it('mantém português e traduz para inglês com parâmetros', () => {
		expect(translate('pt-BR', 'Preferências')).toBe('Preferências');
		expect(translate('en-US', 'Preferências')).toBe('Preferences');
		expect(translate('en-US', 'Texto sem tradução')).toBe('Texto sem tradução');
		expect(translate('en-US', '{n} dias de atraso', { n: 3 })).toBe('3 days overdue');
	});
	it('traduz mensagens de erro do servidor', () => {
		expect(translateMessage('en-US', 'Mensagem desconhecida')).toBe('Mensagem desconhecida');
	});
	it('valida idioma e referência nas preferências', () => {
		const db = new DatabaseSync(':memory:');
		runMigrations(db);
		expect(loadPreferences(db).lang).toBe('pt-BR');
		savePreferences(db, { lang: 'en-US', reference: 'hide' });
		expect(loadPreferences(db)).toMatchObject({ lang: 'en-US', reference: 'hide' });
		expect(() => savePreferences(db, { lang: 'fr' })).toThrow();
	});
});
