import { listItems } from '#lib/gtd/items.ts';
import { LIST_META, type ListName, type StateList } from '#lib/gtd/core.ts';
import { parseFocusView, parseItemGrouping } from '#lib/gtd/list-view.ts';
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
		logbook: ['completed'],
		trash: ['trash']
	};
	const focusView = parseFocusView(url.searchParams.get('view'));
	const allItems = listItems(db, list, filter, today);
	const items =
		list !== 'focus' || focusView === 'both'
			? allItems
			: focusView === 'starred'
				? allItems.filter((item) => item.starred)
				: allItems.filter((item) => item.kind === 'task' && item.dueAt != null && item.dueAt < today);
	return {
		list,
		groupBy: parseItemGrouping(url.searchParams.get('group')),
		focusView,
		meta: LIST_META[list],
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
