<script lang="ts">
	import ItemList from '#lib/components/ItemList.svelte';
	import { postAction } from '#lib/client/actions.ts';
	import type { PageProps } from './$types';
	import { useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const t = useT();
	let title = $state('');
	let error = $state('');

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		error = (await postAction('capture', { title, kind: 'reference', state: 'someday' })) ?? '';
		if (!error) title = '';
	}
</script>

<svelte:head><title>{t('Referência')} · GTDone</title></svelte:head>

<h1>📎 {t('Referência')}</h1>
<p class="muted">{t('Informações para consultar, sem ação associada. Use “Converter em ação” no menu do item.')}</p>

<form class="bar" onsubmit={add}>
	<input bind:value={title} placeholder={t('Nova referência…')} aria-label={t('Nova referência')} />
	<button type="submit">{t('Adicionar')}</button>
</form>
<form class="bar" method="GET">
	<input type="search" name="q" value={data.q} placeholder={t('Buscar nas referências')} aria-label={t('Buscar')} />
	<button type="submit" class="ghost">{t('Buscar')}</button>
</form>
{#if error}<p class="error">{t.msg(error)}</p>{/if}

<ItemList
	items={data.items}
	today={data.today}
	projects={data.projects}
	areas={data.areas}
	contacts={data.contacts}
	tags={data.tags}
	emptyText={t('Nenhuma referência.')}
/>

<style>
	h1 {
		margin: 0;
	}
	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.bar {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}
	.bar input {
		flex: 1;
	}
	.error {
		color: var(--danger);
	}
</style>
