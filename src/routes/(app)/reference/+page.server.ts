import { listReferences } from '#lib/gtd/items.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, parent }) => {
	const { filter } = await parent();
	const q = url.searchParams.get('q') ?? '';
	return { q, items: listReferences(getDb(), q, filter) };
};

export const actions: Actions = appActions;
