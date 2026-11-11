<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import type { PageProps } from './$types';
	import { useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const t = useT();
	let name = $state('');
	let error = $state('');
	let draggingId = $state<number | null>(null);
	const PROJECT_DRAG_TYPE = 'application/x-gtdone-project';

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

	function dragProject(e: DragEvent, id: number) {
		draggingId = id;
		e.dataTransfer?.setData(PROJECT_DRAG_TYPE, String(id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
</script>

<svelte:head><title>{t('Projetos')} · GTDone</title></svelte:head>

<h1>📁 {t('Projetos')}</h1>
<p class="subtitle">{t('Resultados que exigem mais de uma ação. Projetos ativos sem próxima ação ficam destacados.')}</p>

<form class="add" onsubmit={create}>
	<input bind:value={name} placeholder={t('Novo projeto… (Enter para criar)')} aria-label={t('Novo projeto')} required />
</form>
{#if error}<p class="error">{t.msg(error)}</p>{/if}

{#each SECTIONS as [key, label] (key)}
	{#if data[key].length}
		<h3>{t(label)}</h3>
		<ul>
			{#each data[key] as p (p.id)}
				<li
					class:dragging={draggingId === p.id}
					draggable="true"
					title={t('Arraste para mover o projeto')}
					ondragstart={(e) => dragProject(e, p.id)}
					ondragend={() => (draggingId = null)}
				>
					<span class="handle" aria-hidden="true">⋮⋮</span>
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
	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.subtitle {
		color: var(--muted);
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
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
	}
	li[draggable='true'] {
		cursor: grab;
	}
	li.dragging {
		opacity: 0.5;
	}
	.handle {
		color: var(--muted);
		font-size: 0.85rem;
		user-select: none;
	}
	li .muted {
		margin-left: auto;
	}
	.chip {
		font-size: 0.8rem;
		padding: 0.15rem 0.55rem;
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
