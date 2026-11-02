<script lang="ts">
	import ItemList from '#lib/components/ItemList.svelte';
	import type { PageProps } from './$types';
	import { useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const t = useT();
</script>

<svelte:head><title>{t('Busca')} · GTDone</title></svelte:head>

<h1>{t('Busca')}</h1>
<p class="muted">{data.q ? t('Resultados para “{q}”', { q: data.q }) : t('Digite algo na busca.')}</p>

<ItemList
	items={data.items}
	today={data.today}
	projects={data.projects}
	areas={data.areas}
	contacts={data.contacts}
	tags={data.tags}
	emptyText={t('Nada encontrado.')}
/>

<style>
	h1 {
		margin: 0;
	}
	.muted {
		color: var(--muted);
	}
</style>
