import { fail, redirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import type { DatabaseSync } from 'node:sqlite';
import { GtdError, parseDateInput, startOfTodayUtc } from '#lib/gtd/core.ts';
import {
	addChecklistEntry,
	bulkApply,
	duplicateItem,
	removeChecklistEntry,
	toggleChecklistEntry,
	captureItem,
	completeItem,
	deleteItemPermanently,
	emptyTrash,
	getItem,
	moveItem,
	reorderItems,
	restoreItem,
	setKind,
	setStarred,
	trashItem,
	updateItem,
	type ItemInput,
	type ViewFilter
} from '#lib/gtd/items.ts';
import {
	createProject,
	projectFromItem,
	updateProject,
	completeProject,
	reopenProject
} from '#lib/gtd/projects.ts';
import {
	createGoal,
	deleteGoal,
	linkGoal,
	setGoalsFor,
	unlinkGoal,
	updateGoal,
	type LinkTarget
} from '#lib/gtd/goals.ts';
import { loadPreferences, type Preferences } from '#lib/gtd/preferences.ts';
import { listNamed } from '#lib/gtd/organize.ts';
import { parseQuickAdd } from '#lib/nlp/quick-add.ts';
import { getDb } from './db.ts';

export const AREA_COOKIE = 'gtdone_area';

function positiveInt(v: string | null): number | null {
	const n = Number(v);
	return v && Number.isInteger(n) && n > 0 ? n : null;
}

export function loadViewFilter(
	cookies: Cookies,
	url: URL,
	validAreaIds: number[],
	prefs?: Preferences
): ViewFilter {
	const raw = cookies.get(AREA_COOKIE);
	let area: ViewFilter['area'] = null;
	if (raw === 'none') area = 'none';
	else if (raw && validAreaIds.includes(Number(raw))) area = Number(raw);
	const q = url.searchParams;
	const energy = q.get('energy');
	const due = q.get('due');
	return {
		area,
		tagId: positiveInt(q.get('tag')),
		energy: energy === 'low' || energy === 'medium' || energy === 'high' ? energy : null,
		maxMinutes: positiveInt(q.get('time')),
		contactId: positiveInt(q.get('contact')),
		projectId: positiveInt(q.get('project')),
		due: due === 'overdue' || due === 'week' ? due : null,
		sort: q.get('sort') === 'due' ? 'due' : null,
		includeUnassigned: prefs?.unassignedUnderFilter === 'visible',
		weekStart: prefs?.weekStart === 'sunday' ? 0 : 1
	};
}

function optId(fd: FormData, key: string): number | null {
	const v = String(fd.get(key) ?? '');
	if (!v) return null;
	if (!/^[1-9]\d*$/.test(v)) throw new GtdError('identificador inválido');
	return Number(v);
}

function reqId(fd: FormData, key = 'id'): number {
	const v = optId(fd, key);
	if (v == null) throw new GtdError('identificador inválido');
	return v;
}

function has(fd: FormData, key: string) {
	return fd.has(key);
}

function readItemInput(fd: FormData): ItemInput {
	const input: ItemInput = {};
	if (has(fd, 'title')) input.title = fd.get('title');
	if (has(fd, 'notes')) input.notes = fd.get('notes');
	if (has(fd, 'state')) input.state = fd.get('state');
	if (has(fd, 'dueAt')) input.dueAt = parseDateInput(fd.get('dueAt'));
	if (has(fd, 'startsAt')) input.startsAt = parseDateInput(fd.get('startsAt'));
	if (has(fd, 'energy')) input.energy = fd.get('energy');
	if (has(fd, 'minutes')) input.minutes = fd.get('minutes');
	if (has(fd, 'projectId')) input.projectId = optId(fd, 'projectId');
	if (has(fd, 'areaId')) input.areaId = optId(fd, 'areaId');
	if (has(fd, 'contactId')) input.contactId = optId(fd, 'contactId');
	if (has(fd, 'tags')) input.tags = fd.get('tags');
	if (has(fd, 'recurrence')) input.recurrence = fd.get('recurrence');
	if (fd.get('starred') === '1') input.starred = true;
	if (fd.get('kind') === 'reference') input.kind = 'reference';
	return input;
}

// Quick Add: "$área", "@contexto", "!urgência" e datas escritas no título.
// Só preenche o que o formulário não definiu explicitamente.
function applyQuickAdd(db: DatabaseSync, input: ItemInput, today: number) {
	const areas = listNamed(db, 'areas');
	const r = parseQuickAdd(String(input.title ?? ''), {
		today,
		dateOrder: loadPreferences(db).dateFormat === 'mdy' ? 'mdy' : 'dmy',
		areas: areas.map((a) => a.name)
	});
	input.title = r.title;
	if (r.area && input.areaId === undefined) input.areaId = areas.find((a) => a.name === r.area)?.id;
	if (r.contexts.length && input.tags === undefined) input.tags = r.contexts;
	if (r.urgency === 'high') input.starred = true;
	if (r.dueAt != null && input.dueAt === undefined) input.dueAt = r.dueAt;
	if (r.recurrence && input.recurrence === undefined) input.recurrence = `${r.recurrence.unit}:${r.recurrence.every}`;
}

type Handler = (db: DatabaseSync, fd: FormData, ev: RequestEvent, today: number) => unknown;

function act(handler: Handler) {
	return async (ev: RequestEvent) => {
		try {
			const fd = await ev.request.formData();
			handler(getDb(), fd, ev, startOfTodayUtc());
			return { ok: true };
		} catch (e) {
			if (e instanceof GtdError) return fail(e.status, { error: e.message });
			throw e;
		}
	};
}

function areaOfFilter(ev: RequestEvent): number | null {
	const raw = ev.cookies.get(AREA_COOKIE);
	return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
}

// Preferência "Inbox e áreas": ao tirar uma tarefa da Entrada, ela herda a área filtrada.
function assignCurrentArea(db: DatabaseSync, ev: RequestEvent, id: number, fromInbox: boolean) {
	const area = areaOfFilter(ev);
	if (!fromInbox || area == null || loadPreferences(db).inboxArea !== 'assign') return;
	const cur = getItem(db, id);
	if (cur.areaId == null && cur.projectId == null) updateItem(db, id, { areaId: area }, startOfTodayUtc());
}

function readTarget(fd: FormData): LinkTarget {
	const kind = String(fd.get('kind') ?? '');
	if (kind === 'item') return { itemId: reqId(fd, 'targetId') };
	if (kind === 'project') return { projectId: reqId(fd, 'targetId') };
	throw new GtdError('tipo de vínculo inválido');
}

export const appActions = {
	capture: act((db, fd, ev, today) => {
		const input = readItemInput(fd);
		if (fd.get('quick') === '1') applyQuickAdd(db, input, today);
		if (input.areaId === undefined) input.areaId = areaOfFilter(ev);
		captureItem(db, input, today);
	}),
	edit: act((db, fd, _ev, today) => updateItem(db, reqId(fd), readItemInput(fd), today)),
	move: act((db, fd, ev, today) => {
		const starts = has(fd, 'startsAt') ? parseDateInput(fd.get('startsAt')) : undefined;
		const id = reqId(fd);
		const fromInbox = getItem(db, id).state === 'inbox';
		moveItem(db, id, String(fd.get('state') ?? ''), today, starts);
		assignCurrentArea(db, ev, id, fromInbox);
	}),
	complete: act((db, fd, _ev, today) => completeItem(db, reqId(fd), today)),
	duplicate: act((db, fd, _ev, today) => duplicateItem(db, reqId(fd), today)),
	checkAdd: act((db, fd) => addChecklistEntry(db, reqId(fd), fd.get('title'))),
	checkToggle: act((db, fd) => toggleChecklistEntry(db, reqId(fd), fd.get('done') === '1')),
	checkRemove: act((db, fd) => removeChecklistEntry(db, reqId(fd))),
	trash: act((db, fd) => trashItem(db, reqId(fd))),
	restore: act((db, fd, _ev, today) => restoreItem(db, reqId(fd), today)),
	star: act((db, fd) => setStarred(db, reqId(fd), fd.get('starred') === '1')),
	kind: act((db, fd) => setKind(db, reqId(fd), String(fd.get('kind') ?? ''))),
	reorder: act((db, fd) => {
		const ids = String(fd.get('ids') ?? '')
			.split(',')
			.map(Number);
		if (ids.some((n) => !Number.isInteger(n) || n < 1)) throw new GtdError('itens inválidos');
		reorderItems(db, ids);
	}),
	toProject: async (ev: RequestEvent) => {
		let id: number;
		try {
			const fd = await ev.request.formData();
			id = projectFromItem(getDb(), reqId(fd), startOfTodayUtc());
		} catch (e) {
			if (e instanceof GtdError) return fail(e.status, { error: e.message });
			throw e;
		}
		redirect(303, `/projects/${id}`);
	},
	createProject: async (ev: RequestEvent) => {
		let id: number;
		try {
			const fd = await ev.request.formData();
			id = createProject(
				getDb(),
				{
					name: fd.get('name'),
					desiredOutcome: fd.get('desiredOutcome'),
					areaId: optId(fd, 'areaId') ?? areaOfFilter(ev)
				},
				startOfTodayUtc()
			);
		} catch (e) {
			if (e instanceof GtdError) return fail(e.status, { error: e.message });
			throw e;
		}
		redirect(303, `/projects/${id}`);
	},
	updateProject: act((db, fd, _ev, today) => {
		const id = reqId(fd);
		if (fd.get('complete') === '1') return completeProject(db, id);
		if (fd.get('reopen') === '1') return reopenProject(db, id);
		updateProject(
			db,
			id,
			{
				name: fd.get('name'),
				desiredOutcome: fd.get('desiredOutcome'),
				notes: fd.get('notes'),
				state: fd.get('state'),
				areaId: optId(fd, 'areaId'),
				startsAt: parseDateInput(fd.get('startsAt')),
				dueAt: parseDateInput(fd.get('dueAt')),
				tags: fd.get('tags'),
				executionMode: fd.get('executionMode')
			},
			today
		);
	}),
	createGoal: async (ev: RequestEvent) => {
		let id: number;
		try {
			const fd = await ev.request.formData();
			id = createGoal(getDb(), {
				name: fd.get('name'),
				description: fd.get('description'),
				dueAt: parseDateInput(fd.get('dueAt'))
			});
		} catch (e) {
			if (e instanceof GtdError) return fail(e.status, { error: e.message });
			throw e;
		}
		redirect(303, `/goals/${id}`);
	},
	updateGoal: act((db, fd) => {
		const input: Parameters<typeof updateGoal>[2] = {};
		if (has(fd, 'name')) input.name = fd.get('name');
		if (has(fd, 'description')) input.description = fd.get('description');
		if (has(fd, 'dueAt')) input.dueAt = parseDateInput(fd.get('dueAt'));
		if (has(fd, 'status')) input.status = fd.get('status');
		updateGoal(db, reqId(fd), input);
	}),
	deleteGoal: act((db, fd) => deleteGoal(db, reqId(fd))),
	goalLink: act((db, fd) => {
		const goalId = reqId(fd, 'goalId');
		if (fd.get('op') === 'unlink') unlinkGoal(db, goalId, readTarget(fd));
		else linkGoal(db, goalId, readTarget(fd));
	}),
	setGoals: act((db, fd) => {
		const ids = String(fd.get('goalIds') ?? '')
			.split(',')
			.filter(Boolean)
			.map(Number);
		if (ids.some((n) => !Number.isInteger(n) || n < 1)) throw new GtdError('identificador inválido');
		setGoalsFor(db, readTarget(fd), ids);
	}),
	deleteForever: act((db, fd) => deleteItemPermanently(db, reqId(fd))),
	emptyTrash: act((db) => {
		emptyTrash(db);
	}),
	bulk: act((db, fd, _ev, today) => {
		const ids = String(fd.get('ids') ?? '')
			.split(',')
			.filter(Boolean)
			.map(Number);
		if (ids.some((n) => !Number.isInteger(n) || n < 1)) throw new GtdError('itens inválidos');
		bulkApply(db, ids, String(fd.get('op') ?? ''), today, String(fd.get('arg') ?? ''));
	}),
	setArea: async (ev: RequestEvent) => {
		const v = String((await ev.request.formData()).get('area') ?? '');
		if (v && v !== 'none' && !/^[1-9]\d*$/.test(v)) return fail(400, { error: 'área inválida' });
		ev.cookies.set(AREA_COOKIE, v, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: ev.url.protocol === 'https:',
			maxAge: v ? 60 * 60 * 24 * 365 : 0
		});
		return { ok: true };
	}
};
