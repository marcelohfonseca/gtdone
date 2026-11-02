<script lang="ts">
	import { page } from '$app/state';
	import type { Item } from '#lib/gtd/items.ts';
	import {
		CAL_MODES,
		CAL_VIEWS,
		buildEvents,
		calendarRange,
		dayKey,
		parseDay,
		shiftAnchor,
		type CalEvent,
		type CalMode,
		type CalView
	} from '#lib/calendar.ts';
	import { usePrefs, useT } from '#lib/prefs-context.ts';
	import ItemRow from './ItemRow.svelte';

	type Named = { id: number; name: string };
	let {
		view,
		mode = 'both',
		anchor,
		items,
		today,
		projects,
		areas,
		contacts,
		tags
	}: {
		view: CalView;
		mode?: CalMode;
		anchor: string;
		items: Item[];
		today: number;
		projects: Named[];
		areas: Named[];
		contacts: Named[];
		tags: Named[];
	} = $props();

	const prefs = usePrefs();
	const t = useT();

	const VIEW_LABEL: Record<CalView, string> = {
		deadlines: 'Agenda',
		'3days': '3 dias',
		next7: '7 dias',
		week: 'Semanal',
		month: 'Mensal',
		gantt: 'Gantt'
	};

	const MODE_LABEL: Record<CalMode, string> = { both: 'Ambos', planned: 'Planejado', deadlines: 'Prazos' };

	const range = $derived(
		calendarRange(view, parseDay(anchor) ?? today, today, prefs().weekStart === 'sunday' ? 0 : 1)
	);
	const events = $derived(buildEvents(items, range, today, mode));
	const sortedDays = $derived([...events.byDay.keys()].sort((a, b) => a - b));
	const navigable = $derived(view === '3days' || view === 'week' || view === 'month' || view === 'gantt');

	const locale = $derived(prefs().lang);
	const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o });
	const weekday = $derived(fmt({ weekday: 'short' }));
	const dayLong = $derived(fmt({ weekday: 'long', day: 'numeric', month: 'long' }));
	const dayLongYear = $derived(fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
	const dayShort = $derived(fmt({ day: 'numeric', month: 'short' }));
	const monthName = $derived(fmt({ month: 'long', year: 'numeric' }));

	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const year = (ms: number) => new Date(ms).getUTCFullYear();
	const dayTitle = (ms: number) => cap((year(ms) === year(today) ? dayLong : dayLongYear).format(ms));

	const title = $derived.by(() => {
		if (view === 'month' || view === 'gantt') return cap(monthName.format(range.anchor));
		if (view === 'deadlines') return t('Agenda');
		if (view === 'next7') return t('Próximos 7 dias');
		const [a, b] = [range.days[0], range.days[range.days.length - 1]];
		return `${dayShort.format(a)} – ${dayShort.format(b)}${year(b) !== year(today) ? ` ${year(b)}` : ''}`;
	});

	function href(next: { view?: CalView; mode?: CalMode; date?: number | null }) {
		const u = new URL(page.url.href);
		u.searchParams.set('mode', next.mode ?? mode);
		u.searchParams.set('view', next.view ?? view);
		if (next.date == null) u.searchParams.delete('date');
		else u.searchParams.set('date', dayKey(next.date));
		return `${u.pathname}${u.search}`;
	}

	const prevHref = $derived(href({ date: shiftAnchor(view, range.anchor, -1) }));
	const nextHref = $derived(href({ date: shiftAnchor(view, range.anchor, 1) }));
	const todayHref = $derived(href({ date: null }));

	// Seleção: um dia inteiro (lista completa) ou um item específico.
	let selected = $state<{ day: number } | { id: number } | null>(null);
	const selectedEvents = $derived.by<CalEvent<Item>[]>(() => {
		const s = selected;
		if (!s) return [];
		if ('day' in s) return events.byDay.get(s.day) ?? [];
		const all = [...events.byDay.values()].flat().concat(events.overdue);
		const hit = all.find((e) => e.item.id === s.id);
		return hit ? [hit] : [];
	});
	$effect(() => {
		void view;
		void anchor;
		selected = null;
	});

	const ganttBars = $derived(
		view === 'gantt'
			? items.map((it) => {
					const first = range.days[0];
					const s = Math.max(it.startsAt!, first);
					const e = Math.min(it.dueAt!, range.days[range.days.length - 1]);
					return { item: it, col: (s - first) / 86_400_000 + 2, span: (e - s) / 86_400_000 + 1 };
				})
			: []
	);
	const ganttItem = $derived.by(() => {
		const s = selected;
		return s && 'id' in s ? items.find((i) => i.id === s.id) : undefined;
	});

	const MAX_CHIPS = 3;
	const rowProps = $derived({ today, projects, areas, contacts, tags });
</script>

{#snippet chip(e: CalEvent<Item>)}
	<button
		class="chip"
		class:start={e.kind === 'start'}
		class:late={e.kind === 'due' && e.date < today}
		class:active={selected != null && 'id' in selected && selected.id === e.item.id}
		title={e.item.title}
		onclick={() => (selected = { id: e.item.id })}
	>
		{#if e.kind === 'start'}<span aria-label={t('Início')}>▶</span>{/if}{e.item.title}
	</button>
{/snippet}

{#snippet detail()}
	{#if selectedEvents.length}
		<section class="detail" aria-live="polite">
			<header>
				<strong>
					{#if selected && 'day' in selected}{dayTitle(selected.day)}{:else}{t('Item selecionado')}{/if}
				</strong>
				<button class="ghost" onclick={() => (selected = null)} aria-label={t('Fechar')}>✕</button>
			</header>
			{#each selectedEvents as e (`${e.item.id}-${e.kind}`)}
				<ItemRow item={e.item} {...rowProps} />
			{/each}
		</section>
	{/if}
{/snippet}

<div class="cal">
	<div class="bar">
		<div class="tabs" role="tablist" aria-label={t('O que exibir')} class:hidden={view === 'gantt'}>
			{#each CAL_MODES as m (m)}
				<a
					role="tab"
					aria-selected={mode === m}
					class:on={mode === m}
					href={href({ mode: m, date: range.anchor })}
					data-sveltekit-noscroll
					data-sveltekit-preload-data="hover">{t(MODE_LABEL[m])}</a
				>
			{/each}
		</div>
		<div class="tabs" role="tablist" aria-label={t('Visão do calendário')}>
			{#each CAL_VIEWS as v (v)}
				<a
					role="tab"
					aria-selected={view === v}
					class:on={view === v}
					href={href({ view: v, date: v === view ? range.anchor : null })}
					data-sveltekit-noscroll
					data-sveltekit-preload-data="hover">{t(VIEW_LABEL[v])}</a
				>
			{/each}
		</div>
		<div class="nav">
			{#if navigable}
				<a class="btn ghost" href={prevHref} aria-label={t('Anterior')} data-sveltekit-noscroll data-sveltekit-preload-data="hover">‹</a>
				<a class="btn ghost" href={todayHref} data-sveltekit-noscroll>{t('Hoje')}</a>
				<a class="btn ghost" href={nextHref} aria-label={t('Próximo')} data-sveltekit-noscroll data-sveltekit-preload-data="hover">›</a>
			{/if}
			<h2>{title}</h2>
		</div>
	</div>

	{#if view === 'gantt'}
		<div class="scroll">
			<div class="gantt" style:--n={range.days.length}>
				<div class="gh gl"></div>
				{#each range.days as d (d)}
					<div class="gh" class:today={d === today}>{new Date(d).getUTCDate()}</div>
				{/each}
				{#each ganttBars as b (b.item.id)}
					<button class="gl" title={b.item.title} onclick={() => (selected = { id: b.item.id })}>{b.item.title}</button>
					<div class="gtrack" style:grid-column="2 / -1">
						<div
							class="gbar"
							class:late={b.item.dueAt! < today}
							class:active={selected != null && 'id' in selected && selected.id === b.item.id}
							style:grid-column="{b.col - 1} / span {b.span}"
							title="{b.item.title} · {dayKey(b.item.startsAt!)} → {dayKey(b.item.dueAt!)}"
						></div>
					</div>
				{/each}
			</div>
		</div>
		{#if !ganttBars.length}<p class="muted">{t('Nenhum item com início e prazo neste mês.')}</p>{/if}
		{#if ganttItem}
			<section class="detail">
				<header>
					<strong>{t('Item selecionado')}</strong>
					<button class="ghost" onclick={() => (selected = null)} aria-label={t('Fechar')}>✕</button>
				</header>
				<ItemRow item={ganttItem} {...rowProps} />
			</section>
		{/if}
	{:else if view === 'deadlines' || view === 'next7'}
		{@const listDays = view === 'next7' ? range.days : sortedDays}
		{#if events.overdue.length}
			<h3 class="day late">{t('Atrasadas')}</h3>
			{#each events.overdue as e (`${e.item.id}-o`)}<ItemRow item={e.item} {...rowProps} />{/each}
		{/if}
		{#each listDays as d (d)}
			{@const list = events.byDay.get(d) ?? []}
			{#if list.length || view === 'next7'}
				<h3 class="day" class:today={d === today}>
					{d === today ? `${t('Hoje')} · ` : ''}{dayTitle(d)}
				</h3>
				{#each list as e (`${e.item.id}-${e.kind}`)}
					<div class="ev">
						{#if e.kind === 'start'}<span class="tag" title={t('Data de início')}>▶ {t('Início')}</span>{/if}
						<div class="grow"><ItemRow item={e.item} {...rowProps} /></div>
					</div>
				{:else}
					<p class="muted none">{t('Nada neste dia.')}</p>
				{/each}
			{/if}
		{/each}
		{#if !events.overdue.length && !sortedDays.length}
			<p class="muted">{t('Nenhum item com data.')}</p>
		{/if}
	{:else}
		<div class="scroll">
			<div class="grid" class:month={view === 'month'} style:--cols={view === '3days' ? 3 : 7}>
				{#if view === 'month' || view === 'week'}
					{#each range.days.slice(0, 7) as d (d)}
						<div class="dow">{weekday.format(d)}</div>
					{/each}
				{/if}
				{#each range.days as d (d)}
					{@const list = events.byDay.get(d) ?? []}
					{@const outside = range.month != null && (d < range.month.first || d > range.month.last)}
					<div class="cell" class:today={d === today} class:outside>
						<button class="num" onclick={() => (selected = { day: d })} aria-label={dayTitle(d)}>
							{view === 'month' ? new Date(d).getUTCDate() : `${weekday.format(d)} ${new Date(d).getUTCDate()}`}
						</button>
						{#each view === 'month' ? list.slice(0, MAX_CHIPS) : list as e (`${e.item.id}-${e.kind}`)}
							{@render chip(e)}
						{/each}
						{#if view === 'month' && list.length > MAX_CHIPS}
							<button class="more" onclick={() => (selected = { day: d })}>
								{t('+{n} mais', { n: list.length - MAX_CHIPS })}
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</div>
		{@render detail()}
	{/if}
</div>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		margin: 0.75rem 0;
	}
	.tabs {
		display: flex;
		gap: 0.2rem;
		flex-wrap: wrap;
	}
	.tabs a {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.tabs a.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.hidden {
		visibility: hidden;
	}
	.gantt {
		display: grid;
		grid-template-columns: 12rem repeat(var(--n), minmax(1.5rem, 1fr));
		border: 1px solid var(--border);
		min-width: min-content;
	}
	.gh {
		text-align: center;
		font-size: 0.75rem;
		color: var(--muted);
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--border);
	}
	.gh.today {
		color: var(--accent);
		font-weight: 700;
	}
	.gl {
		all: unset;
		cursor: pointer;
		box-sizing: border-box;
		padding: 0.3rem 0.5rem;
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		position: sticky;
		left: 0;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
	}
	.gtrack {
		display: grid;
		grid-template-columns: subgrid;
		align-items: center;
		border-bottom: 1px solid var(--border);
		padding: 0.25rem 0;
	}
	.gbar {
		height: 1rem;
		border-radius: 4px;
		background: var(--accent);
	}
	.gbar.late {
		background: var(--danger);
	}
	.gbar.active {
		outline: 2px solid var(--text);
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.nav h2 {
		margin: 0 0 0 0.5rem;
		font-size: 1.05rem;
	}
	.btn {
		padding: 0.25rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		text-decoration: none;
		color: var(--text);
	}
	.scroll {
		overflow-x: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(6rem, 1fr));
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		min-width: min-content;
	}
	.dow {
		background: var(--surface);
		padding: 0.3rem;
		text-align: center;
		font-size: 0.8rem;
		color: var(--muted);
		text-transform: capitalize;
	}
	.cell {
		background: var(--bg);
		padding: 0.25rem;
		min-height: 7rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.month .cell {
		min-height: 5.5rem;
	}
	.cell.outside {
		opacity: 0.5;
	}
	.cell.today {
		background: color-mix(in srgb, var(--accent) 12%, var(--bg));
	}
	.num {
		all: unset;
		cursor: pointer;
		font-size: 0.8rem;
		color: var(--muted);
		text-transform: capitalize;
	}
	.today .num {
		color: var(--accent);
		font-weight: 700;
	}
	.chip {
		all: unset;
		cursor: pointer;
		box-sizing: border-box;
		font-size: 0.8rem;
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		background: color-mix(in srgb, var(--accent) 22%, var(--surface));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.chip.start {
		background: var(--surface);
		border: 1px dashed var(--border);
	}
	.chip.late {
		background: color-mix(in srgb, var(--danger) 25%, var(--surface));
	}
	.chip.active {
		outline: 2px solid var(--accent);
	}
	.more {
		all: unset;
		cursor: pointer;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.detail {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
	}
	.detail header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.day {
		margin: 1rem 0 0.2rem;
		font-size: 0.95rem;
		border-bottom: 1px solid var(--border);
	}
	.day.today {
		color: var(--accent);
	}
	.day.late {
		color: var(--danger);
	}
	.ev {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.ev .grow {
		flex: 1;
		min-width: 0;
	}
	.tag,
	.muted {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.none {
		margin: 0.2rem 0;
	}
	@media print {
		.bar .tabs,
		.bar .btn {
			display: none;
		}
	}
</style>
