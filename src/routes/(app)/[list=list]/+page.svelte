<script lang="ts">
	import ItemList from '#lib/components/ItemList.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import { postAction } from '#lib/client/actions.ts';
	import RapidEntry from '#lib/components/RapidEntry.svelte';
	import type { PageProps } from './$types';

	import { usePrefs, useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const prefs = usePrefs();
	const t = useT();

	let error = $state('');

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
	const groupBy = $derived(
		data.list === 'focus' ? 'focus' : data.list === 'waiting' ? 'contact' : data.list === 'scheduled' ? 'schedule' : ['next', 'later', 'someday'].includes(data.list) ? 'project' : 'none'
	);
</script>

<svelte:head><title>{t(data.meta.label)} · GTDone</title></svelte:head>

<h1>{data.meta.icon} {t(data.meta.label)}</h1>
<p class="subtitle">{t(data.meta.subtitle)}</p>

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
