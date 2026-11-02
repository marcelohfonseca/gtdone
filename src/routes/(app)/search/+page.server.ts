import { searchItems } from '#lib/gtd/items.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	return { q, items: searchItems(getDb(), q) };
};

export const actions: Actions = appActions;
