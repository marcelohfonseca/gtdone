<script lang="ts">
	import { page } from '$app/state';
	import ItemList from '#lib/components/ItemList.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import type { FocusView, ItemGrouping } from '#lib/gtd/list-view.ts';
	import { postAction } from '#lib/client/actions.ts';
	import RapidEntry from '#lib/components/RapidEntry.svelte';
	import type { PageProps } from './$types';

	import { usePrefs, useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const prefs = usePrefs();
	const t = useT();

	let error = $state('');
	const GROUPINGS: [ItemGrouping, string][] = [
		['project', 'Projeto'],
		['context', 'Contexto'],
		['time', 'Tempo'],
		['energy', 'Energia']
	];
	const FOCUS_MODES: [FocusView, string][] = [
		['both', 'Ambos'],
		['starred', 'Estrelado'],
		['overdue', 'Vencido']
	];

	function groupingHref(group: ItemGrouping) {
		const url = new URL(page.url.href);
		if (group === 'project') url.searchParams.delete('group');
		else url.searchParams.set('group', group);
		return `${url.pathname}${url.search}`;
	}

	function focusHref(view: FocusView) {
		const url = new URL(page.url.href);
		if (view === 'both') url.searchParams.delete('view');
		else url.searchParams.set('view', view);
		return `${url.pathname}${url.search}`;
	}

	async function reopen(id: number) {
		error = (await postAction('updateProject', { id, reopen: '1' })) ?? '';
	}

	async function restoreProject(id: number) {
		error = (await postAction('updateProject', { id, restore: '1' })) ?? '';
	}

	async function purgeProject(id: number) {
		if (!confirm(t('Excluir definitivamente? Isso não pode ser desfeito.'))) return;
		error = (await postAction('updateProject', { id, purge: '1' })) ?? '';
	}

	async function emptyTrash() {
		if (!confirm(t('Esvaziar a lixeira? Os itens serão excluídos definitivamente.'))) return;
		error = (await postAction('emptyTrash', {})) ?? '';
	}

	const inactiveList = $derived(data.list === 'later' || data.list === 'someday');
	const groupBy = $derived.by(() => {
		if (data.list === 'focus') return 'focus';
		if (data.list === 'waiting') return 'contact';
		if (data.list === 'scheduled') return 'schedule';
		if (data.list === 'next' || data.list === 'later') return data.groupBy;
		if (data.list === 'someday') return 'project';
		return 'none';
	});
</script>

<svelte:head><title>{t(data.meta.label)} · GTDone</title></svelte:head>

<h1>{data.meta.icon} {t(data.meta.label)}</h1>
<p class="subtitle">{t(data.meta.subtitle)}</p>

{#if data.list === 'focus'}
	<div class="grouping" role="tablist" aria-label={t('O que exibir')}>
		{#each FOCUS_MODES as [view, label] (view)}
			<a
				role="tab"
				aria-selected={data.focusView === view}
				class:on={data.focusView === view}
				href={focusHref(view)}
				data-sveltekit-noscroll
				data-sveltekit-preload-data="hover">{t(label)}</a
			>
		{/each}
	</div>
{/if}

{#if data.list === 'next' || data.list === 'later'}
	<div class="grouping" role="tablist" aria-label={t('Agrupar por')}>
		{#each GROUPINGS as [group, label] (group)}
			<a
				role="tab"
				aria-selected={data.groupBy === group}
				class:on={data.groupBy === group}
				href={groupingHref(group)}
				data-sveltekit-noscroll
				data-sveltekit-preload-data="hover">{t(label)}</a
			>
		{/each}
	</div>
{/if}

{#if data.defaultState && prefs().rapidEntry === 'show'}
	<RapidEntry listState={data.defaultState} starred={data.list === 'focus'} />
{/if}

<FilterBar tags={data.tags} contacts={data.contacts} projects={data.projects} />

{#snippet projectGroup()}
	{#if data.groupedProjects.length}
		<h3 class="group">{inactiveList ? t('Projetos (inativos)') : t('Projetos')}</h3>
		<ul class="projects">
			{#each data.groupedProjects as p (p.id)}
				<li><span class="actions-badge">{p.openCount} {p.openCount === 1 ? t('ação') : t('ações')}</span> <a href={`/projects/${p.id}`}>{p.name}</a>
					{#if data.list === 'logbook'}<button class="ghost" onclick={() => reopen(p.id)}>{t('Reabrir')}</button>{/if}
				{#if data.list === 'trash'}
					<button class="ghost" onclick={() => restoreProject(p.id)}>{t('Restaurar')}</button>
					<button class="ghost danger" onclick={() => purgeProject(p.id)}>{t('Excluir definitivamente')}</button>
				{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#if !inactiveList && data.list !== 'next'}{@render projectGroup()}{/if}

{#if error}<p class="error">{t.msg(error)}</p>{/if}
{#if data.list === 'trash' && (data.items.length || data.groupedProjects.length)}
	<button class="ghost" onclick={emptyTrash}>{t('Esvaziar lixeira')}</button>
{/if}

{#if data.list === 'inbox' && data.items.length}
	<p class="tip">{t('Dica: se leva menos de 2 minutos, faça agora; senão mova para a lista certa.')}</p>
{/if}

<ItemList
	items={data.items}
	today={data.today}
	projects={data.projects}
	areas={data.areas}
	contacts={data.contacts}
	tags={data.tags}
	{groupBy}
	limitPerGroup={data.list === 'next' || data.list === 'later' ? 3 : 0}
	emptyText={data.meta.empty}
/>

{#if inactiveList}{@render projectGroup()}{/if}

<style>
	.actions-badge {
		font-size: 0.75rem;
		padding: 0.05rem 0.4rem;
		border-radius: 4px;
		background: var(--surface-2);
		color: var(--muted);
		white-space: nowrap;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	.subtitle {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.grouping {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem;
		margin: 0.75rem 0;
	}
	.grouping a {
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.grouping a.on {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
	.tip {
		background: var(--surface-2);
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
	}
	.error {
		color: var(--danger);
	}
	.group {
		font-size: 0.8rem;
		text-transform: uppercase;
		color: var(--muted);
	}
	.projects {
		list-style: none;
		padding: 0;
	}
	.projects li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
		display: flex;
		gap: 0.6rem;
		align-items: center;
	}
</style>
