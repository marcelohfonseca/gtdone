<script lang="ts">
	import type { PageProps } from './$types';
	import ManageTags from '#lib/components/ManageTags.svelte';
	import { useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const t = useT();
</script>

<svelte:head><title>{t('Gerenciar tags…')} · GTDone</title></svelte:head>

<h1>{t('Gerenciar tags…')}</h1>
<ManageTags areas={data.areas} contacts={data.contacts} tags={data.tags} initial={data.kind} />
