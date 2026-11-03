import { startOfTodayUtc } from '#lib/gtd/core.ts';
import { activateScheduled, countItems, purgeLogbook } from '#lib/gtd/items.ts';
import { getSetting, listNamed } from '#lib/gtd/organize.ts';
import { activateScheduledProjects, listProjects } from '#lib/gtd/projects.ts';
import { goalIdsByTarget, listGoals } from '#lib/gtd/goals.ts';
import { listBoards } from '#lib/gtd/kanban.ts';
import { loadPreferences } from '#lib/gtd/preferences.ts';
import { loadViewFilter } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ cookies, url }) => {
	const db = getDb();
	const today = startOfTodayUtc();
	activateScheduled(db, today);
	activateScheduledProjects(db, today);
	purgeLogbook(db, Number(getSetting(db, 'logbook.retentionDays') ?? 0));
	const prefs = loadPreferences(db);
	const areas = listNamed(db, 'areas');
	const filter = loadViewFilter(
		cookies,
		url,
		areas.map((a) => a.id),
		prefs
	);
	return {
		today,
		prefs,
		areas,
		tags: listNamed(db, 'tags'),
		contacts: listNamed(db, 'contacts'),
		filter,
		boards: listBoards(db).map((b) => ({ id: b.id, name: b.name })),
		goals: listGoals(db).map((g) => ({ id: g.id, name: g.name })),
		goalLinks: goalIdsByTarget(db),
		sidebarProjects: listProjects(db, ['active'], filter).map((p) => ({
			id: p.id,
			name: p.name,
			openCount: p.openCount,
			sequential: p.executionMode === 'sequential'
		})),
		inactiveProjects: listProjects(db, ['later'], filter).map((p) => ({ id: p.id, name: p.name })),
		projects: listProjects(db, ['active', 'later', 'scheduled', 'someday']).map((p) => ({
			id: p.id,
			name: p.name
		})),
		counts: countItems(
			db,
			{ area: filter.area, tagId: null, includeUnassigned: filter.includeUnassigned },
			today
		)
	};
};
