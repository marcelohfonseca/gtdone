<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import { useT } from '#lib/prefs-context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = useT();
	let name = $state('');
	let groupBy = $state('state');
	let projectId = $state('');
	let error = $state('');

	const GROUPINGS = [
		['state', 'Estado (lista GTD)'],
		['project', 'Projeto'],
		['area', 'Área'],
		['custom', 'Colunas personalizadas']
	] as const;

	async function create(e: SubmitEvent) {
		e.preventDefault();
		error = (await postAction('createBoard', { name, groupBy, projectId })) ?? '';
	}
</script>

<svelte:head><title>Kanban · GTDone</title></svelte:head>

<h1>🗂️ Kanban</h1>
<p class="subtitle muted">{t('Quadros com as suas ações. Crie várias visões, cada uma com seu agrupamento, colunas e filtro de projeto.')}</p>

<form class="add" onsubmit={create}>
	<input bind:value={name} placeholder={t('Novo quadro… (Enter para criar)')} aria-label={t('Novo quadro')} required />
	<select bind:value={groupBy} aria-label={t('Agrupar por')}>
		{#each GROUPINGS as [v, l] (v)}<option value={v}>{t(l)}</option>{/each}
	</select>
	<select bind:value={projectId} aria-label={t('Apenas o projeto')}>
		<option value="">{t('Todos os projetos')}</option>
		{#each data.projects as p (p.id)}<option value={String(p.id)}>{p.name}</option>{/each}
	</select>
	<button type="submit">{t('Criar')}</button>
</form>
{#if error}<p class="error">{t.msg(error)}</p>{/if}

<ul>
	{#each data.boards as b (b.id)}
		<li><a href={`/kanban/${b.id}`}>{b.name}</a></li>
	{:else}
		<li class="muted">{t('Nenhum quadro.')}</li>
	{/each}
</ul>

<style>
	h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	.subtitle {
		margin: 0.2rem 0 1rem;
		font-size: 0.9rem;
	}
	.add {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.add input {
		flex: 1;
		min-width: 12rem;
	}
	.muted {
		color: var(--muted);
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
	}
	.error {
		color: var(--danger);
	}
</style>
