import { error } from '@sveltejs/kit';
import { GtdError } from '#lib/gtd/core.ts';
import { getGoal, goalLinks } from '#lib/gtd/goals.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	try {
		const db = getDb();
		const goal = getGoal(db, Number(params.id));
		const links = goalLinks(db, goal.id);
		const linkedItems = new Set(links.items.map((i) => i.id));
		const linkedProjects = new Set(links.projects.map((p) => p.id));
		const candidateItems = db
			.prepare("SELECT id, title FROM items WHERE state NOT IN ('completed', 'trash') ORDER BY title COLLATE NOCASE LIMIT 1000")
			.all()
			.map((r) => ({ id: Number(r.id), title: String(r.title) }))
			.filter((i) => !linkedItems.has(i.id));
		const candidateProjects = db
			.prepare("SELECT id, name FROM projects WHERE state NOT IN ('completed', 'trash') ORDER BY name COLLATE NOCASE")
			.all()
			.map((r) => ({ id: Number(r.id), name: String(r.name) }))
			.filter((p) => !linkedProjects.has(p.id));
		return { goal, links, candidateItems, candidateProjects };
	} catch (e) {
		if (e instanceof GtdError) error(e.status, e.message);
		throw e;
	}
};

export const actions: Actions = appActions;
