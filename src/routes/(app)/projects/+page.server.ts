import { listProjects } from '#lib/gtd/projects.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { filter } = await parent();
	const db = getDb();
	const byState = (states: string[]) => listProjects(db, states, filter);
	return {
		active: byState(['active']),
		later: byState(['later']),
		scheduled: byState(['scheduled']),
		someday: byState(['someday'])
	};
};

export const actions: Actions = appActions;
