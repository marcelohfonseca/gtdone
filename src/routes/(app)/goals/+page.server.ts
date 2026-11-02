import { listGoals } from '#lib/gtd/goals.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const db = getDb();
	return { active: listGoals(db, ['active']), achieved: listGoals(db, ['achieved']), archived: listGoals(db, ['archived']) };
};

export const actions: Actions = appActions;
