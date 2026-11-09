export const ITEM_GROUPINGS = ['project', 'context', 'time', 'energy'] as const;
export type ItemGrouping = (typeof ITEM_GROUPINGS)[number];

export const FOCUS_VIEWS = ['both', 'starred', 'overdue'] as const;
export type FocusView = (typeof FOCUS_VIEWS)[number];

export function parseItemGrouping(value: string | null | undefined): ItemGrouping {
	return (ITEM_GROUPINGS as readonly string[]).includes(value ?? '') ? (value as ItemGrouping) : 'project';
}

export function parseFocusView(value: string | null | undefined): FocusView {
	return (FOCUS_VIEWS as readonly string[]).includes(value ?? '') ? (value as FocusView) : 'both';
}
