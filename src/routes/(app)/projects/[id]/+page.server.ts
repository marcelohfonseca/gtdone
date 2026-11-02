import { error } from '@sveltejs/kit';
import { loadPreferences } from '#lib/gtd/preferences.ts';
import { listNamed } from '#lib/gtd/organize.ts';
import { getProject } from '#lib/gtd/projects.ts';
import { projectItems } from '#lib/gtd/items.ts';
import { GtdError } from '#lib/gtd/core.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	try {
		const db = getDb();
		const project = getProject(db, Number(params.id));
		return { project, items: projectItems(db, project.id, loadPreferences(db).completedPosition === 'bottom'), areas: listNamed(db, 'areas') };
	} catch (e) {
		if (e instanceof GtdError) error(e.status, e.message);
		throw e;
	}
};

export const actions: Actions = appActions;
