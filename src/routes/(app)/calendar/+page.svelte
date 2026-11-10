<script lang="ts">
	import Calendar from '#lib/components/Calendar.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import { useT } from '#lib/prefs-context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = useT();
</script>

<svelte:head><title>{t('Calendário')} · GTDone</title></svelte:head>

<h1>🗓️ {t('Calendário')}</h1>
<p class="subtitle">{t('Planejado (início) e prazos em um só lugar.')}</p>

<FilterBar tags={data.tags} contacts={data.contacts} projects={data.projects} />

<Calendar
	view={data.calendar.view}
	mode={data.calendar.mode}
	anchor={data.calendar.anchor}
	items={data.items}
	today={data.today}
	projects={data.projects}
	areas={data.areas}
	contacts={data.contacts}
	tags={data.tags}
/>
