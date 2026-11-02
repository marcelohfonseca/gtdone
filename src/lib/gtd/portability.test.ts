import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '#lib/db/migrations.ts';
import { captureItem, getItem, listItems, addChecklistEntry } from './items.ts';
import { createNamed } from './organize.ts';
import { createProject } from './projects.ts';
import { exportData, importData } from './portability.ts';
import {
	captureFromEmail,
	generateInboundToken,
	loadDigestConfig,
	parseSender,
	revokeInboundToken,
	runDigestTick,
	saveDigestConfig,
	setAllowedSenders,
	verifyInboundToken,
	digestStatus
} from './integrations.ts';
import { GtdError } from './core.ts';
import { itemsAsText } from '../format.ts';

const TODAY = Date.UTC(2025, 5, 10);

function memDb() {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON;');
	runMigrations(db);
	return db;
}

function seed(db: DatabaseSync) {
	const area = createNamed(db, 'areas', 'Casa');
	const project = createProject(db, { name: 'Reforma', areaId: area }, TODAY);
	const id = captureItem(db, { title: 'Pintar sala', notes: 'tinta branca', state: 'next', projectId: project, tags: 'obra' }, TODAY);
	addChecklistEntry(db, id, 'Comprar tinta');
	return id;
}

describe('exportação e importação', () => {
	it('round-trip preserva itens, relações e checklists e ignora contas', () => {
		const a = memDb();
		const id = seed(a);
		a.prepare("INSERT INTO settings (key, value) VALUES ('integration.secret', 'x')").run();
		const file = JSON.parse(JSON.stringify(exportData(a)));
		expect(file.tables.users).toBeUndefined();
		expect(JSON.stringify(file)).not.toContain('integration.secret');

		const b = memDb();
		b.prepare("INSERT INTO settings (key, value) VALUES ('integration.keep', 'y')").run();
		captureItem(b, { title: 'Lixo antigo', state: 'next' }, TODAY);
		importData(b, file);
		const items = listItems(b, 'next', undefined, TODAY);
		expect(items.map((i) => i.title)).toEqual(['Pintar sala']);
		const got = getItem(b, id);
		expect(got.tags).toEqual(['obra']);
		expect(got.projectName).toBe('Reforma');
		expect(got.checklist).toHaveLength(1);
		expect(b.prepare("SELECT value FROM settings WHERE key = 'integration.keep'").get()?.value).toBe('y');
	});

	it('dados inválidos são rejeitados sem alterar o banco', () => {
		const db = memDb();
		seed(db);
		const good = JSON.parse(JSON.stringify(exportData(db)));
		const before = JSON.stringify(exportData(db).tables);

		const bad = (mutate: (f: typeof good) => void) => {
			const f = JSON.parse(JSON.stringify(good));
			mutate(f);
			expect(() => importData(db, f)).toThrow(GtdError);
			expect(JSON.stringify(exportData(db).tables)).toBe(before);
		};
		bad((f) => (f.format = 'outro'));
		bad((f) => (f.schemaVersion = 1));
		bad((f) => (f.tables.items[0].title = null));
		bad((f) => (f.tables.items[0].bogus = 1));
		bad((f) => (f.tables.mystery = []));
		bad((f) => (f.tables.items[0].project_id = 999));
		bad((f) => f.tables.settings.push({ key: 'integration.x', value: '1' }));
		expect(() => importData(db, null)).toThrow(GtdError);
	});

	it('dryRun valida sem gravar', () => {
		const a = memDb();
		seed(a);
		const file = exportData(a);
		const b = memDb();
		const summary = importData(b, file, { dryRun: true });
		expect(summary.items).toBe(1);
		expect(listItems(b, 'next', undefined, TODAY)).toHaveLength(0);
	});
});

describe('texto de lista', () => {
	it('gera markdown com checklist e metadados', () => {
		const db = memDb();
		const id = seed(db);
		const text = itemsAsText([getItem(db, id)]);
		expect(text).toContain('- [ ] Pintar sala (projeto: Reforma · #obra)');
		expect(text).toContain('    tinta branca');
		expect(text).toContain('    - [ ] Comprar tinta');
	});
});

describe('captura por email', () => {
	it('exige token válido e remetente autorizado', () => {
		const db = memDb();
		expect(verifyInboundToken(db, 'qualquer')).toBe(false);
		const token = generateInboundToken(db);
		expect(verifyInboundToken(db, token)).toBe(true);
		expect(verifyInboundToken(db, token + 'x')).toBe(false);
		expect(db.prepare('SELECT value FROM settings WHERE key LIKE ?').get('%tokenHash')?.value).not.toBe(token);

		const mail = { from: 'Ana <Ana@Exemplo.com>', subject: ' Ligar  para o banco ', text: 'detalhes' };
		expect(() => captureFromEmail(db, mail, TODAY)).toThrow(/não autorizado/);
		setAllowedSenders(db, 'ana@exemplo.com');
		const id = captureFromEmail(db, mail, TODAY);
		const item = getItem(db, id);
		expect(item).toMatchObject({ title: 'Ligar para o banco', notes: 'detalhes', state: 'inbox' });
		expect(() => captureFromEmail(db, { ...mail, from: 'intruso@x.com' }, TODAY)).toThrow(GtdError);
		expect(() => setAllowedSenders(db, 'não-é-email')).toThrow(GtdError);
		expect(parseSender('Nome <a@b.co>')).toBe('a@b.co');

		revokeInboundToken(db);
		expect(verifyInboundToken(db, token)).toBe(false);
	});
});

describe('email periódico do Foco', () => {
	const at = (h: number, m = 0) => new Date(2025, 5, 10, h, m); // terça-feira

	function setup() {
		const db = memDb();
		captureItem(db, { title: 'Importante', state: 'next', starred: true }, TODAY);
		saveDigestConfig(db, { enabled: true, days: [2], time: '08:00', to: 'eu@x.com' });
		return db;
	}

	it('valida configuração', () => {
		const db = memDb();
		expect(() => saveDigestConfig(db, { enabled: true, days: [2], time: '8h', to: 'a@b.co' })).toThrow(GtdError);
		expect(() => saveDigestConfig(db, { enabled: true, days: [], time: '08:00', to: 'a@b.co' })).toThrow(GtdError);
		expect(() => saveDigestConfig(db, { enabled: true, days: [9], time: '08:00', to: 'a@b.co' })).toThrow(GtdError);
		expect(loadDigestConfig(db).enabled).toBe(false);
	});

	it('envia uma vez por dia no horário configurado', async () => {
		const db = setup();
		const sent: string[] = [];
		const send = async (m: { text: string }) => void sent.push(m.text);
		expect(await runDigestTick(db, at(7, 59), send)).toBe('skipped');
		expect(await runDigestTick(db, at(8, 0), send)).toBe('sent');
		expect(await runDigestTick(db, at(9, 0), send)).toBe('skipped');
		expect(sent).toHaveLength(1);
		expect(sent[0]).toContain('Importante');
		expect(await runDigestTick(db, new Date(2025, 5, 11, 9), send)).toBe('skipped'); // quarta: dia não configurado
	});

	it('falhas: espera 15 min e para após 3 tentativas', async () => {
		const db = setup();
		const fail = async () => {
			throw new Error('SMTP fora');
		};
		expect(await runDigestTick(db, at(8, 0), fail)).toBe('failed');
		expect(await runDigestTick(db, at(8, 5), fail)).toBe('skipped');
		expect(await runDigestTick(db, at(8, 15), fail)).toBe('failed');
		expect(await runDigestTick(db, at(8, 30), fail)).toBe('failed');
		expect(await runDigestTick(db, at(9, 0), fail)).toBe('skipped');
		expect(digestStatus(db)).toMatchObject({ attempts: 3, error: 'SMTP fora' });
		const ok = async () => {};
		expect(await runDigestTick(db, new Date(2025, 5, 17, 8, 0), ok)).toBe('sent');
		expect(digestStatus(db).error).toBeNull();
	});

	it('não envia quando o Foco está vazio', async () => {
		const db = memDb();
		saveDigestConfig(db, { enabled: true, days: [2], time: '08:00', to: 'eu@x.com' });
		expect(await runDigestTick(db, at(8, 0), async () => {})).toBe('empty');
	});
});
