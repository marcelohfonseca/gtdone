import { listCalendarItems, listItems } from '#lib/gtd/items.ts';
import { calendarRange, dayKey, parseDay, parseView } from '#lib/calendar.ts';
import { LIST_META, type ListName, type StateList } from '#lib/gtd/core.ts';
import { listProjects } from '#lib/gtd/projects.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { filter, today } = await parent();
	const list = params.list as ListName;
	const db = getDb();
	const projectStates: Record<string, string[]> = {
		next: ['active'],
		later: ['later'],
		scheduled: ['scheduled'],
		someday: ['someday'],
		logbook: ['completed']
	};
	// "Agendadas" é o calendário: todo item aberto com prazo ou início, filtrado pelo intervalo da visão.
	let calendar: { view: ReturnType<typeof parseView>; anchor: string; from: string | null; to: string | null } | null = null;
	let items;
	if (list === 'scheduled') {
		const view = parseView(url.searchParams.get('view'));
		const anchor = parseDay(url.searchParams.get('date')) ?? today;
		const range = calendarRange(view, anchor, today, filter.weekStart ?? 1);
		items = listCalendarItems(db, range.from, range.to, filter, today, view === 'deadlines' || view === 'next7');
		calendar = {
			view,
			anchor: dayKey(range.anchor),
			from: range.from == null ? null : dayKey(range.from),
			to: range.to == null ? null : dayKey(range.to)
		};
	} else {
		items = listItems(db, list, filter, today);
	}
	return {
		list,
		meta: LIST_META[list],
		calendar,
		items,
		groupedProjects: projectStates[list]
			? listProjects(db, projectStates[list], filter).map((p) => ({
					id: p.id,
					name: p.name,
					state: p.state,
					openCount: p.openCount
				}))
			: [],
		defaultState: (['inbox', 'next', 'later', 'waiting', 'scheduled', 'someday'].includes(list)
			? list
			: list === 'focus'
				? 'next'
				: null) as StateList | null
	};
};

export const actions: Actions = appActions;
