import { listItems } from '#lib/gtd/items.ts';
import { listProjects } from '#lib/gtd/projects.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

const STEPS = ['inbox', 'projects', 'next', 'waiting', 'scheduled', 'someday'] as const;

export const load: PageServerLoad = async ({ url, parent }) => {
	const { today } = await parent();
	const db = getDb();
	const asked = Number(url.searchParams.get('step'));
	const step = Number.isInteger(asked) && asked >= 0 && asked < STEPS.length ? asked : 0;
	const name = STEPS[step];
	return {
		step,
		total: STEPS.length,
		name,
		items: name === 'projects' ? [] : listItems(db, name, undefined, today),
		reviewProjects: name === 'projects' ? listProjects(db, ['active', 'later', 'scheduled', 'someday']) : []
	};
};

export const actions: Actions = appActions;
