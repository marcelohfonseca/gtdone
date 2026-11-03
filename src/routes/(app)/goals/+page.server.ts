import { listGoals } from '#lib/gtd/goals.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const db = getDb();
	const { filter } = await parent();
	return {
		active: listGoals(db, ['active'], filter.area),
		achieved: listGoals(db, ['achieved'], filter.area),
		archived: listGoals(db, ['archived'], filter.area)
	};
};

export const actions: Actions = appActions;
