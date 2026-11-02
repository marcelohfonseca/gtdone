<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import { useT } from '#lib/prefs-context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = useT();
	let name = $state('');
	let error = $state('');

	const SECTIONS = [
		['active', 'Ativos'],
		['achieved', 'Alcançados'],
		['archived', 'Arquivados']
	] as const;

	async function create(e: SubmitEvent) {
		e.preventDefault();
		error = (await postAction('createGoal', { name })) ?? '';
	}
</script>

<svelte:head><title>{t('Objetivos')} · GTDone</title></svelte:head>

<h1>🎯 {t('Objetivos')}</h1>
<p class="muted">{t('Aonde você quer chegar. Vincule ações e projetos a cada objetivo para acompanhar o progresso.')}</p>

<form class="add" onsubmit={create}>
	<input bind:value={name} placeholder={t('Novo objetivo… (Enter para criar)')} aria-label={t('Novo objetivo')} required />
</form>
{#if error}<p class="error">{t.msg(error)}</p>{/if}

{#each SECTIONS as [key, label] (key)}
	{#if data[key].length}
		<h3>{t(label)}</h3>
		<ul>
			{#each data[key] as g (g.id)}
				<li>
					<a href={`/goals/${g.id}`}>{g.name}</a>
					<span class="muted">{g.doneCount}/{g.linkCount}</span>
				</li>
			{/each}
		</ul>
	{/if}
{:else}
	<p class="muted">{t('Nenhum objetivo.')}</p>
{/each}

<style>
	.add input {
		width: 100%;
	}
	.muted {
		color: var(--muted);
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		gap: 0.6rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
	}
	.error {
		color: var(--danger);
	}
</style>
