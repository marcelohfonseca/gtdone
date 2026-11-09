import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '#lib/db/migrations.ts';
import {
	captureItem,
	completeItem,
	countItems,
	getItem,
	listItems,
	moveItem,
	reorderItems,
	restoreItem,
	searchItems,
	trashItem,
	updateItem,
	activateScheduled,
	bulkApply,
	deleteItemPermanently,
	emptyTrash,
	purgeLogbook,
	addChecklistEntry,
	toggleChecklistEntry,
	duplicateItem,
	listReferences
} from './items.ts';
import { loadPreferences, savePreferences } from './preferences.ts';
import { trashProject, restoreProject, createProject, getProject, listProjects, projectFromItem, reopenProject, completeProject, updateProject } from './projects.ts';
import { createNamed, deleteNamed, listNamed, convertNamed, parseTagNames, setNamedColor, resolveTagField } from './organize.ts';
import { GtdError, parseDateInput, advanceDate, parseRecurrence } from './core.ts';

const TODAY = Date.UTC(2025, 5, 10);
const DAY = 86_400_000;

function memDb() {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON;');
	runMigrations(db);
	return db;
}

describe('migração v3', () => {
	it('preserva itens, tags e projetos ao recriar as tabelas', () => {
		const db = new DatabaseSync(':memory:');
		db.exec('PRAGMA foreign_keys = ON;');
		runMigrations(db, 2);
		const now = Date.now();
		db.prepare(
			"INSERT INTO projects (name, state, created_at, updated_at) VALUES ('P', 'active', ?, ?)"
		).run(now, now);
		db.prepare(
			"INSERT INTO items (title, state, project_id, created_at, updated_at) VALUES ('A', 'next', 1, ?, ?)"
		).run(now, now);
		db.prepare("INSERT INTO tags (name, created_at, updated_at) VALUES ('t', ?, ?)").run(now, now);
		db.prepare('INSERT INTO item_tags (item_id, tag_id) VALUES (1, 1)').run();
		runMigrations(db);
		expect(getItem(db, 1)).toMatchObject({ title: 'A', projectName: 'P', tags: ['t'] });
		expect(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys).toBe(1);
	});
});

describe('itens', () => {
	it('captura na caixa de entrada e move entre listas', () => {
		const db = memDb();
		const id = captureItem(db, { title: '  Ligar  ', tags: '#casa, casa, Rua' }, TODAY);
		expect(getItem(db, id)).toMatchObject({ title: 'Ligar', state: 'inbox', tags: ['Rua', 'casa'] });
		moveItem(db, id, 'later', TODAY);
		expect(listItems(db, 'later')).toHaveLength(1);
		expect(listItems(db, 'inbox')).toHaveLength(0);
		expect(() => captureItem(db, { title: ' ' }, TODAY)).toThrow(GtdError);
	});

	it('agenda por data: futura fica agendada, vencida vira próxima', () => {
		const db = memDb();
		expect(() => captureItem(db, { title: 'x', state: 'scheduled' }, TODAY)).toThrow(GtdError);
		const id = captureItem(db, { title: 'x', state: 'scheduled', startsAt: TODAY + 3 * DAY }, TODAY);
		expect(getItem(db, id).state).toBe('scheduled');
		activateScheduled(db, TODAY + 3 * DAY);
		expect(getItem(db, id).state).toBe('next');
		const n = captureItem(db, { title: 'n', state: 'next', startsAt: TODAY + DAY }, TODAY);
		expect(getItem(db, n).state).toBe('scheduled');
	});

	it('conclui, descarta e restaura para a lista anterior', () => {
		const db = memDb();
		const id = captureItem(db, { title: 'a', state: 'waiting' }, TODAY);
		completeItem(db, id);
		expect(listItems(db, 'logbook')).toHaveLength(1);
		expect(() => updateItem(db, id, { title: 'b' }, TODAY)).toThrow(GtdError);
		restoreItem(db, id, TODAY);
		expect(getItem(db, id)).toMatchObject({ state: 'waiting', completedAt: null });
		trashItem(db, id);
		expect(listItems(db, 'trash')).toHaveLength(1);
		restoreItem(db, id, TODAY);
		expect(getItem(db, id).state).toBe('waiting');
	});

	it('Foco lista estrelas e esconde ações de projetos inativos', () => {
		const db = memDb();
		const p = createProject(db, { name: 'P' }, TODAY);
		const a = captureItem(db, { title: 'a', state: 'next', starred: true, projectId: p }, TODAY);
		captureItem(db, { title: 'b', state: 'next' }, TODAY);
		expect(listItems(db, 'focus').map((i) => i.id)).toEqual([a]);
		updateProject(db, p, { state: 'someday' }, TODAY);
		expect(listItems(db, 'focus')).toHaveLength(0);
		expect(listItems(db, 'next')).toHaveLength(1);
		expect(countItems(db, { area: null, tagId: null }, TODAY).focus).toBe(0);
	});

	it('filtra por área (herdada do projeto) e por tag', () => {
		const db = memDb();
		const area = createNamed(db, 'areas', 'Casa');
		const p = createProject(db, { name: 'P', areaId: area }, TODAY);
		const a = captureItem(db, { title: 'a', state: 'next', projectId: p, tags: 'x' }, TODAY);
		captureItem(db, { title: 'b', state: 'next' }, TODAY);
		expect(listItems(db, 'next', { area, tagId: null }).map((i) => i.id)).toEqual([a]);
		expect(listItems(db, 'next', { area: 'none', tagId: null })).toHaveLength(1);
		deleteNamed(db, 'areas', area);
		expect(listProjects(db)[0].areaId).toBeNull();
	});

	it('reordena e busca escapando curingas', () => {
		const db = memDb();
		const a = captureItem(db, { title: 'a 100%' }, TODAY);
		const b = captureItem(db, { title: 'b' }, TODAY);
		reorderItems(db, [b, a]);
		expect(listItems(db, 'inbox').map((i) => i.id)).toEqual([b, a]);
		expect(searchItems(db, '100%').map((i) => i.id)).toEqual([a]);
		expect(searchItems(db, '%')).toHaveLength(1);
	});
});

describe('engajar', () => {
	it('Focus inclui próximas vencidas/de hoje automaticamente', () => {
		const db = memDb();
		const manual = captureItem(db, { title: 'm', state: 'next', starred: true }, TODAY);
		const late = captureItem(db, { title: 'l', state: 'next', dueAt: TODAY - DAY }, TODAY);
		const todayItem = captureItem(db, { title: 't', state: 'next', dueAt: TODAY }, TODAY);
		captureItem(db, { title: 'futuro', state: 'next', dueAt: TODAY + DAY }, TODAY);
		captureItem(db, { title: 'espera', state: 'waiting', dueAt: TODAY - DAY }, TODAY);
		const ids = listItems(db, 'focus', undefined, TODAY).map((i) => i.id);
		expect(ids.sort()).toEqual([manual, late, todayItem].sort());
		expect(countItems(db, { area: null, tagId: null }, TODAY)).toMatchObject({ focus: 3, overdue: 1 });
	});

	it('combina filtros de energia, tempo, contato, prazo e ordena por prazo', () => {
		const db = memDb();
		const c = createNamed(db, 'contacts', 'Ana');
		const a = captureItem(db, { title: 'a', state: 'next', energy: 'low', minutes: 10, dueAt: TODAY + 5 * DAY }, TODAY);
		const b = captureItem(db, { title: 'b', state: 'next', energy: 'high', minutes: 60 }, TODAY);
		const n = captureItem(db, { title: 'n', state: 'next', dueAt: TODAY - DAY, contactId: c }, TODAY);
		const base = { area: null, tagId: null } as const;
		const ids = (f: object) => listItems(db, 'next', { ...base, ...f }, TODAY).map((i) => i.id);
		expect(ids({ energy: 'low' })).toEqual([a]);
		expect(ids({ maxMinutes: 15 }).sort()).toEqual([a, n].sort());
		expect(ids({ contactId: c })).toEqual([n]);
		expect(ids({ due: 'overdue' })).toEqual([n]);
		expect(ids({ due: 'week' }).sort()).toEqual([a, n].sort());
		expect(ids({ sort: 'due' })).toEqual([n, a, b]);
		expect(ids({ energy: 'low', maxMinutes: 5 })).toEqual([]);
	});

	it('busca também por tag e projeto', () => {
		const db = memDb();
		const p = createProject(db, { name: 'Reforma' }, TODAY);
		const a = captureItem(db, { title: 'x', projectId: p }, TODAY);
		const b = captureItem(db, { title: 'y', tags: 'urgente' }, TODAY);
		expect(searchItems(db, 'refor').map((i) => i.id)).toEqual([a]);
		expect(searchItems(db, 'urgen').map((i) => i.id)).toEqual([b]);
	});
});

describe('projetos e encerramento', () => {
	it('projeto sequencial expõe só a primeira ação e destaca projetos sem próxima', () => {
		const db = memDb();
		const p = createProject(db, { name: 'S', executionMode: 'sequential' }, TODAY);
		const a = captureItem(db, { title: 'a', state: 'next', projectId: p }, TODAY);
		const b = captureItem(db, { title: 'b', state: 'next', projectId: p, starred: true }, TODAY);
		expect(listItems(db, 'next').map((i) => i.id)).toEqual([a]);
		expect(listItems(db, 'focus')).toHaveLength(0);
		completeItem(db, a);
		expect(listItems(db, 'next').map((i) => i.id)).toEqual([b]);
		updateProject(db, p, { executionMode: 'parallel' }, TODAY);
		expect(getProject(db, p).executionMode).toBe('parallel');
		completeItem(db, b);
		expect(getProject(db, p).stalled).toBe(true);
		expect(() => updateProject(db, p, { executionMode: 'x' }, TODAY)).toThrow(GtdError);
	});

	it('conclui e reabre projeto sem perder ações', () => {
		const db = memDb();
		const p = createProject(db, { name: 'P' }, TODAY);
		const a = captureItem(db, { title: 'a', state: 'next', projectId: p }, TODAY);
		completeProject(db, p);
		expect(listProjects(db, ['completed'])).toHaveLength(1);
		reopenProject(db, p);
		expect(listProjects(db)[0].openCount).toBe(1);
		expect(getItem(db, a).projectName).toBe('P');
	});

	it('exclui permanentemente só da lixeira e esvazia a lixeira', () => {
		const db = memDb();
		const a = captureItem(db, { title: 'a' }, TODAY);
		const b = captureItem(db, { title: 'b' }, TODAY);
		expect(() => deleteItemPermanently(db, a)).toThrow(GtdError);
		trashItem(db, a);
		deleteItemPermanently(db, a);
		trashItem(db, b);
		expect(emptyTrash(db)).toBe(1);
		expect(listItems(db, 'trash')).toHaveLength(0);
	});

	it('retenção do Diário remove só o que passou do prazo', () => {
		const db = memDb();
		const old = captureItem(db, { title: 'old' }, TODAY);
		const fresh = captureItem(db, { title: 'fresh' }, TODAY);
		completeItem(db, old);
		completeItem(db, fresh);
		db.prepare('UPDATE items SET completed_at = ? WHERE id = ?').run(Date.now() - 40 * DAY, old);
		expect(purgeLogbook(db, 0)).toBe(0);
		expect(purgeLogbook(db, 30)).toBe(1);
		expect(listItems(db, 'logbook').map((i) => i.id)).toEqual([fresh]);
	});

	it('aplica operações em lote atomicamente', () => {
		const db = memDb();
		const a = captureItem(db, { title: 'a' }, TODAY);
		const b = captureItem(db, { title: 'b', tags: 'x' }, TODAY);
		bulkApply(db, [a, b], 'move', TODAY, 'next');
		bulkApply(db, [a, b], 'tag', TODAY, 'novo');
		expect(getItem(db, b)).toMatchObject({ state: 'next', tags: ['novo', 'x'] });
		expect(() => bulkApply(db, [a, b], 'move', TODAY, 'scheduled')).toThrow(GtdError);
		expect(() => bulkApply(db, [], 'complete', TODAY)).toThrow(GtdError);
		bulkApply(db, [a, b], 'complete', TODAY);
		expect(listItems(db, 'logbook')).toHaveLength(2);
	});
});

describe('projetos e organização', () => {
	it('transforma ação em projeto e mantém nomes únicos', () => {
		const db = memDb();
		const id = captureItem(db, { title: 'Reforma' }, TODAY);
		const pid = projectFromItem(db, id, TODAY);
		expect(listProjects(db)[0]).toMatchObject({ id: pid, name: 'Reforma' });
		expect(getItem(db, id).state).toBe('trash');
		createNamed(db, 'tags', 'Foo');
		expect(() => createNamed(db, 'tags', 'foo')).toThrow(GtdError);
	});

	it('valida datas e tags', () => {
		expect(() => parseDateInput('2025-02-30')).toThrow(GtdError);
		expect(parseDateInput('')).toBeNull();
		expect(parseTagNames('a, A ,#b')).toEqual(['a', 'b']);
	});
});

describe('fase 5', () => {
	it('checklist com progresso e cópia sem recorrência', () => {
		const db = memDb();
		const id = captureItem(db, { title: 'Viagem', state: 'next', dueAt: TODAY, recurrence: 'weekly:1' }, TODAY);
		const a = addChecklistEntry(db, id, 'Passagens');
		addChecklistEntry(db, id, 'Hotel');
		toggleChecklistEntry(db, a, true);
		const cur = getItem(db, id);
		expect(cur.checklist.map((c) => c.done)).toEqual([true, false]);
		const copy = getItem(db, duplicateItem(db, id, TODAY));
		expect(copy.title).toBe('Viagem (cópia)');
		expect(copy.checklist.map((c) => c.done)).toEqual([true, false]);
		expect(copy.recurrence).toBeNull();
		expect(() => addChecklistEntry(db, id, '  ')).toThrow(GtdError);
	});

	it('recorrência gera a próxima ocorrência uma única vez', () => {
		const db = memDb();
		const id = captureItem(db, { title: 'Pagar aluguel', state: 'next', dueAt: Date.UTC(2025, 0, 31), recurrence: 'monthly:1' }, TODAY);
		addChecklistEntry(db, id, 'Boleto');
		const next = completeItem(db, id, TODAY);
		expect(next).not.toBeNull();
		expect(completeItem(db, id, TODAY)).toBeNull();
		const n = getItem(db, next!);
		expect(n.dueAt).toBe(Date.UTC(2025, 1, 28));
		expect(n.recurrence).toBe('monthly:1');
		expect(n.checklist.every((c) => !c.done)).toBe(true);
		expect(getItem(db, id).recurrence).toBeNull();
		expect(listItems(db, 'next', undefined, TODAY).map((i) => i.id)).toEqual([next]);
	});

	it('valida recorrência e exige data', () => {
		const db = memDb();
		expect(() => parseRecurrence('hourly:1')).toThrow(GtdError);
		expect(() => parseRecurrence('daily:0')).toThrow(GtdError);
		expect(parseRecurrence('')).toBeNull();
		expect(advanceDate(Date.UTC(2024, 11, 15), { unit: 'yearly', every: 1 })).toBe(Date.UTC(2025, 11, 15));
		expect(() => captureItem(db, { title: 'x', recurrence: 'daily:1' }, TODAY)).toThrow(GtdError);
	});

	it('recorrência por dias da semana, após a conclusão e com fim', () => {
		const db = memDb();
		// 2025-06-09 é segunda; seg/qua/sex
		const mon = Date.UTC(2025, 5, 9);
		expect(advanceDate(mon, { unit: 'weekly', every: 1, weekdays: [1, 3, 5] })).toBe(Date.UTC(2025, 5, 11));
		expect(advanceDate(Date.UTC(2025, 5, 13), { unit: 'weekly', every: 2, weekdays: [1, 3, 5] })).toBe(Date.UTC(2025, 5, 23));
		expect(parseRecurrence('weekly:1;wd=1,3;after=1;until=2025-12-31;count=2')).toMatchObject({ weekdays: [1, 3], after: true, count: 2 });

		const a = captureItem(db, { title: 'após', state: 'next', dueAt: Date.UTC(2025, 0, 1), recurrence: 'daily:3;after=1' }, TODAY);
		expect(getItem(db, completeItem(db, a, TODAY)!).dueAt).toBe(TODAY + 3 * 86_400_000);

		const b = captureItem(db, { title: 'fim', state: 'next', dueAt: TODAY, recurrence: 'daily:1;count=1' }, TODAY);
		const b2 = completeItem(db, b, TODAY)!;
		expect(getItem(db, b2).recurrence).toBe('daily:1;count=0');
		expect(completeItem(db, b2, TODAY)).toBeNull();

		const c = captureItem(db, { title: 'até', state: 'next', dueAt: TODAY, recurrence: 'daily:1;until=2025-06-10' }, TODAY);
		expect(completeItem(db, c, TODAY)).toBeNull();
	});

	it('conclusão em lote respeita recorrência', () => {
		const db = memDb();
		const id = captureItem(db, { title: 'r', state: 'next', dueAt: TODAY, recurrence: 'daily:1' }, TODAY);
		bulkApply(db, [id], 'complete', TODAY);
		expect(listItems(db, 'next', undefined, TODAY)).toHaveLength(1);
	});

	it('referências: criação, busca e conversão', () => {
		const db = memDb();
		captureItem(db, { title: 'Senha do wifi', kind: 'reference', state: 'someday' }, TODAY);
		captureItem(db, { title: 'Comprar pão', state: 'next' }, TODAY);
		expect(listReferences(db).map((i) => i.title)).toEqual(['Senha do wifi']);
		expect(listReferences(db, 'wifi')).toHaveLength(1);
		expect(listReferences(db, 'pão')).toHaveLength(0);
		expect(listReferences(db, 'wifi', { area: 'none', tagId: null })).toHaveLength(1);
	});

	it('preferências: padrões, validação e área sem atribuição', () => {
		const db = memDb();
		expect(loadPreferences(db).theme).toBe('system');
		expect(loadPreferences(db).contentAlignment).toBe('center');
		savePreferences(db, { theme: 'dark', density: 'compact', contentAlignment: 'left' });
		expect(loadPreferences(db)).toMatchObject({ theme: 'dark', density: 'compact', contentAlignment: 'left' });
		expect(() => savePreferences(db, { theme: 'neon', accent: 'blue' })).toThrow(GtdError);
		expect(() => savePreferences(db, { contentAlignment: 'right' })).toThrow(GtdError);
		expect(loadPreferences(db).accent).toBe('green');
		const area = createNamed(db, 'areas', 'Casa');
		captureItem(db, { title: 'Sem área', state: 'next' }, TODAY);
		expect(listItems(db, 'next', { area, tagId: null }, TODAY)).toHaveLength(0);
		expect(listItems(db, 'next', { area, tagId: null, includeUnassigned: true }, TODAY)).toHaveLength(1);
	});
});

describe('cor da área', () => {
	it('salva, limpa e valida a cor', () => {
		const db = new DatabaseSync(':memory:');
		runMigrations(db);
		const id = createNamed(db, 'areas', 'Trabalho');
		expect(listNamed(db, 'areas')[0].color).toBeNull();
		setNamedColor(db, 'areas', id, '#FF8800');
		expect(listNamed(db, 'areas')[0].color).toBe('#ff8800');
		expect(() => setNamedColor(db, 'areas', id, 'vermelho')).toThrow(GtdError);
		setNamedColor(db, 'areas', id, '');
		expect(listNamed(db, 'areas')[0].color).toBeNull();
	});

	it('colore tags e contatos e separa a área do campo de tags', () => {
		const db = new DatabaseSync(':memory:');
		runMigrations(db);
		const tag = createNamed(db, 'tags', 'Casa');
		setNamedColor(db, 'tags', tag, '#3e63dd');
		expect(listNamed(db, 'tags')[0].color).toBe('#3e63dd');
		const contact = createNamed(db, 'contacts', 'Ana');
		setNamedColor(db, 'contacts', contact, '#e5484d');
		expect(listNamed(db, 'contacts')[0].color).toBe('#e5484d');
		const area = createNamed(db, 'areas', 'Trabalho');
		expect(resolveTagField(db, 'casa, trabalho, #pc')).toEqual({ areaId: area, contactId: null, tags: 'casa,pc' });
		const r = resolveTagField(db, '!Novo, @Bia, #ctx, ctx');
		expect(r.tags).toBe('ctx');
		expect(listNamed(db, 'areas').map((a) => a.name)).toContain('Novo');
		expect(listNamed(db, 'contacts').map((c) => c.name)).toContain('Bia');
		expect(resolveTagField(db, '@Bia, !Trabalho', false)).toEqual({ areaId: area, contactId: null, tags: '' });
	});
});

describe('conversão de tipo de tag', () => {
	it('contexto vira pessoa e volta, levando os itens', () => {
		const db = new DatabaseSync(':memory:');
		runMigrations(db);
		const item = captureItem(db, { title: 'Ligar', tags: 'ana' }, TODAY);
		const contactId = convertNamed(db, 'tags', listNamed(db, 'tags')[0].id);
		expect(listNamed(db, 'tags')).toHaveLength(0);
		expect(getItem(db, item).contactId).toBe(contactId);
		convertNamed(db, 'contacts', contactId);
		expect(getItem(db, item).tags).toEqual(['ana']);
		expect(listNamed(db, 'contacts')).toHaveLength(0);
	});
});

describe('projeto na lixeira e edição em lote', () => {
	it('envia projeto à lixeira, restaura e edita em lote', () => {
		const db = memDb();
		const today = TODAY;
		const pid = createProject(db, { name: 'P' }, today);
		const a = captureItem(db, { title: 'a', projectId: pid, state: 'next' }, today);
		trashProject(db, pid);
		expect(getItem(db, a).state).toBe('trash');
		restoreProject(db, pid, today);
		expect(getItem(db, a).state).toBe('next');
		bulkApply(db, [a], 'energy', today, 'high');
		bulkApply(db, [a], 'minutes', today, '30');
		bulkApply(db, [a], 'due', today, '2030-01-02');
		const it = getItem(db, a);
		expect([it.energy, it.minutes, it.dueAt]).toEqual(['high', 30, Date.UTC(2030, 0, 2)]);
		trashProject(db, pid);
		emptyTrash(db);
		expect(db.prepare('SELECT COUNT(*) n FROM projects').get()!.n).toBe(0);
	});
});

describe('pendências adiadas', () => {
	it('busca FTS (trecho no meio da palavra) e consulta curta', () => {
		const db = memDb();
		const a = captureItem(db, { title: 'Comprar leite integral' }, TODAY);
		updateItem(db, a, { notes: 'ver https://exemplo.com/x' }, TODAY);
		captureItem(db, { title: 'Outro' }, TODAY);
		expect(searchItems(db, 'leit').map((i) => i.id)).toEqual([a]);
		expect(searchItems(db, 'EXEMPLO').map((i) => i.id)).toEqual([a]);
		expect(searchItems(db, 'ou').length).toBe(1);
		updateItem(db, a, { title: 'Pagar conta' }, TODAY);
		expect(searchItems(db, 'leite')).toEqual([]);
		trashItem(db, a);
		deleteItemPermanently(db, a);
		expect(db.prepare("SELECT COUNT(*) n FROM items_fts WHERE items_fts MATCH 'conta'").get()!.n).toBe(0);
		expect(searchItems(db, 'conta')).toEqual([]);
	});

	it('filtra por intervalo de início', () => {
		const db = memDb();
		const day = 86_400_000;
		const a = captureItem(db, { title: 'a', state: 'next', startsAt: TODAY - day }, TODAY);
		const b = captureItem(db, { title: 'b', state: 'next', startsAt: TODAY - 3 * day }, TODAY);
		captureItem(db, { title: 'c', state: 'next' }, TODAY);
		const ids = (f: object) => listItems(db, 'next', { area: null, tagId: null, ...f }, TODAY).map((i) => i.id);
		expect(ids({ startFrom: TODAY - 2 * day })).toEqual([a]);
		expect(ids({ startTo: TODAY - 2 * day })).toEqual([b]);
	});

	it('retenção também apaga projetos concluídos antigos', () => {
		const db = memDb();
		const p = createProject(db, { name: 'velho' }, TODAY);
		completeProject(db, p);
		db.prepare('UPDATE projects SET completed_at = 1 WHERE id = ?').run(p);
		purgeLogbook(db, 30);
		expect(db.prepare('SELECT COUNT(*) n FROM projects').get()!.n).toBe(0);
	});
});
