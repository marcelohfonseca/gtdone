<script lang="ts">
	import { goto } from '$app/navigation';
	import { postAction } from '#lib/client/actions.ts';
	import TagInput from '#lib/components/TagInput.svelte';
	import { toDateInput } from '#lib/gtd/core.ts';
	import { useT } from '#lib/prefs-context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = useT();
	let error = $state('');
	let editing = $state(false);
	let itemPick = $state('');
	let projectPick = $state('');
	const g = $derived(data.goal);
	const area = $derived(data.areas.find((a) => a.id === g.areaId));
	let areaText = $state('');
	$effect(() => {
		if (editing) areaText = area ? `!${area.name}, ` : '';
	});
	const pct = $derived(g.linkCount ? Math.round((g.doneCount / g.linkCount) * 100) : 0);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const body: Record<string, string> = { id: String(g.id) };
		new FormData(e.currentTarget as HTMLFormElement).forEach((v, k) => (body[k] = String(v)));
		error = (await postAction('updateGoal', body)) ?? '';
		if (!error) editing = false;
	}

	async function setStatus(status: string) {
		error = (await postAction('updateGoal', { id: g.id, status })) ?? '';
	}

	async function remove() {
		if (!confirm(t('Excluir este objetivo? Ações e projetos vinculados não são apagados.'))) return;
		error = (await postAction('deleteGoal', { id: g.id })) ?? '';
		if (!error) await goto('/goals');
	}

	async function link(kind: 'item' | 'project', targetId: string, op = 'link') {
		if (!targetId) return;
		error = (await postAction('goalLink', { goalId: g.id, kind, targetId, op })) ?? '';
		itemPick = projectPick = '';
	}
</script>

<svelte:head><title>{g.name} · GTDone</title></svelte:head>

{#if !editing}
	<div class="card">
		<button class="title" onclick={() => (editing = true)}>🎯 {g.name}</button>
		{#if area}<span class="chip" style:background={area.color ? `color-mix(in srgb, ${area.color} 22%, transparent)` : undefined} style:color={area.color ?? undefined}>!{area.name}</span>{/if}
		{#if g.dueAt}<span class="muted small">{t('Prazo')}: {toDateInput(g.dueAt)}</span>{/if}
		<button class="ghost" aria-label={t('Editar objetivo')} onclick={() => (editing = true)}>▾</button>
	</div>
	{#if g.description}<p class="muted">{g.description}</p>{/if}
{:else}
	<form class="card edit" onsubmit={save}>
		<!-- svelte-ignore a11y_autofocus -->
		<input name="name" value={g.name} required autofocus aria-label={t('Nome')} />
		<textarea name="description" rows="4" placeholder={t('Descrição')}>{g.description}</textarea>
		<label>{t('Prazo')} <input type="date" name="dueAt" value={toDateInput(g.dueAt)} /></label>
		<TagInput bind:value={areaText} areas={data.areas} contacts={data.contacts} tags={data.tags} areasOnly placeholder={t('Área')} />
		<div class="actions">
			<button type="submit">{t('Salvar')}</button>
			<button type="button" class="ghost" onclick={() => (editing = false)}>{t('Cancelar')}</button>
		</div>
	</form>
{/if}
{#if error}<p class="error">{t.msg(error)}</p>{/if}

<div class="status">
	<span class="chip">{t(g.status === 'active' ? 'Ativo' : g.status === 'achieved' ? 'Alcançado' : 'Arquivado')}</span>
	<progress max="100" value={pct}></progress>
	<span class="muted small">{g.doneCount}/{g.linkCount} ({pct}%)</span>
	{#if g.status !== 'achieved'}<button class="ghost" onclick={() => setStatus('achieved')}>{t('Marcar como alcançado')}</button>{/if}
	{#if g.status !== 'active'}<button class="ghost" onclick={() => setStatus('active')}>{t('Reativar')}</button>{/if}
	{#if g.status === 'active'}<button class="ghost" onclick={() => setStatus('archived')}>{t('Arquivar')}</button>{/if}
	<button class="ghost" onclick={remove}>{t('Excluir')}</button>
</div>

<h3>{t('Vincular')}</h3>
<div class="pickers">
	<select bind:value={itemPick} onchange={() => link('item', itemPick)} aria-label={t('Vincular ação')}>
		<option value="">{t('+ Ação…')}</option>
		{#each data.candidateItems as i (i.id)}<option value={String(i.id)}>{i.title}</option>{/each}
	</select>
	<select bind:value={projectPick} onchange={() => link('project', projectPick)} aria-label={t('Vincular projeto')}>
		<option value="">{t('+ Projeto…')}</option>
		{#each data.candidateProjects as p (p.id)}<option value={String(p.id)}>{p.name}</option>{/each}
	</select>
</div>

<h3>{t('Projetos')}</h3>
<ul>
	{#each data.links.projects as p (p.id)}
		<li>
			<a href={`/projects/${p.id}`} class:done={p.state === 'completed'}>{p.name}</a>
			<button class="ghost" aria-label={t('Desvincular')} onclick={() => link('project', String(p.id), 'unlink')}>×</button>
		</li>
	{:else}
		<li class="muted">{t('Nenhum projeto vinculado.')}</li>
	{/each}
</ul>

<h3>{t('Ações')}</h3>
<ul>
	{#each data.links.items as i (i.id)}
		<li>
			<span class:done={i.state === 'completed'}>{i.title}</span>
			<span class="muted small">{i.state}</span>
			<button class="ghost" aria-label={t('Desvincular')} onclick={() => link('item', String(i.id), 'unlink')}>×</button>
		</li>
	{:else}
		<li class="muted">{t('Nenhuma ação vinculada.')}</li>
	{/each}
</ul>

<style>
	.card {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 1.1rem 1rem;
		margin: 0.5rem 0 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.card.edit {
		flex-direction: column;
		align-items: stretch;
	}
	.card .title {
		all: unset;
		flex: 1;
		cursor: pointer;
		font-size: 1.15rem;
		font-weight: 600;
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 0.8rem;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.75rem;
		color: var(--muted);
		gap: 0.2rem;
	}
	.actions,
	.status,
	.pickers {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.pickers select {
		max-width: 100%;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding: 0.35rem 0;
		border-bottom: 1px solid var(--border);
	}
	.done {
		text-decoration: line-through;
		color: var(--muted);
	}
	.error {
		color: var(--danger);
	}
</style>
