import { calendarRange, dayKey, parseDay, parseMode, parseView } from '#lib/calendar.ts';
import { listCalendarItems, listGanttItems } from '#lib/gtd/items.ts';
import { appActions } from '#lib/server/actions.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { filter, today } = await parent();
	const view = parseView(url.searchParams.get('view'));
	const mode = parseMode(url.searchParams.get('mode'));
	const anchor = parseDay(url.searchParams.get('date')) ?? today;
	const range = calendarRange(view, anchor, today, filter.weekStart ?? 1);
	const items =
		view === 'gantt'
			? listGanttItems(getDb(), range.from!, range.to!, filter, today)
			: listCalendarItems(
					getDb(),
					range.from,
					range.to,
					filter,
					today,
					view === 'deadlines' || (view === 'next7' && range.anchor === today),
					1000,
					mode
				);
	return {
		items,
		calendar: {
			view,
			mode,
			anchor: dayKey(range.anchor)
		}
	};
};

export const actions: Actions = appActions;
