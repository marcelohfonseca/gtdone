import { listBoards } from '#lib/gtd/kanban.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ boards: listBoards(getDb()) });

export const actions: Actions = appActions;
