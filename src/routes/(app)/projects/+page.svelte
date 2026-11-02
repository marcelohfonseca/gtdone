<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import type { PageProps } from './$types';
	import { useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const t = useT();
	let name = $state('');
	let error = $state('');

	const SECTIONS = [
		['active', 'Ativos'],
		['later', 'Depois'],
		['scheduled', 'Agendados'],
		['someday', 'Algum dia']
	] as const;

	async function create(e: SubmitEvent) {
		e.preventDefault();
		error = (await postAction('createProject', { name })) ?? '';
	}
</script>

<svelte:head><title>{t('Projetos')} · GTDone</title></svelte:head>

<h1>{t('Projetos')}</h1>
<p class="muted">{t('Resultados que exigem mais de uma ação. Projetos ativos sem próxima ação ficam destacados.')}</p>

<form class="add" onsubmit={create}>
	<input bind:value={name} placeholder={t('Novo projeto… (Enter para criar)')} aria-label={t('Novo projeto')} required />
</form>
{#if error}<p class="error">{t.msg(error)}</p>{/if}

{#each SECTIONS as [key, label] (key)}
	{#if data[key].length}
		<h3>{t(label)}</h3>
		<ul>
			{#each data[key] as p (p.id)}
				<li>
					<a href={`/projects/${p.id}`}>{p.name}</a>
					{#if p.executionMode === 'sequential'}<span class="chip">{t('sequencial')}</span>{/if}
					{#if p.stalled}<span class="chip warn">{t('sem próxima ação')}</span>{/if}
					<span class="muted">{p.openCount} {p.openCount === 1 ? t('ação') : t('ações')}</span>
				</li>
			{/each}
		</ul>
	{/if}
{:else}
	<p class="muted">{t('Nenhum projeto.')}</p>
{/each}

<style>
	h1 {
		margin: 0;
	}
	h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		color: var(--muted);
		margin: 1.25rem 0 0.25rem;
	}
	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.add input {
		width: 100%;
		box-sizing: border-box;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border);
	}
	li .muted {
		margin-left: auto;
	}
	.chip {
		font-size: 0.7rem;
		padding: 0.1rem 0.5rem;
		border-radius: 1rem;
		background: var(--surface-2);
		color: var(--muted);
	}
	.chip.warn {
		background: var(--danger);
		color: #fff;
	}
	.error {
		color: var(--danger);
	}
</style>
