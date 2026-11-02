import { error } from '@sveltejs/kit';
import { GtdError } from '#lib/gtd/core.ts';
import { boardView } from '#lib/gtd/kanban.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { filter, today, prefs } = await parent();
	try {
		return { view: boardView(getDb(), Number(params.id), filter, today, { none: prefs.lang === 'en-US' ? 'None' : 'Nenhum' }) };
	} catch (e) {
		if (e instanceof GtdError) error(e.status, e.message);
		throw e;
	}
};

export const actions: Actions = appActions;
