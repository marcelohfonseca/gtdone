<script lang="ts">
	import ItemList from '#lib/components/ItemList.svelte';
	import TagInput from '#lib/components/TagInput.svelte';
	import GoalPicker from '#lib/components/GoalPicker.svelte';
	import RapidEntry from '#lib/components/RapidEntry.svelte';
	import { postAction } from '#lib/client/actions.ts';
	import { goto } from '$app/navigation';
	import { toDateInput } from '#lib/gtd/core.ts';
	import type { PageProps } from './$types';

	import { usePrefs, useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const prefs = usePrefs();
	const t = useT();
	let error = $state('');
	let editing = $state(false);
	const p = $derived(data.project);
	const areaName = $derived(data.areas.find((a) => a.id === p.areaId)?.name);
	let tagText = $state('');
	$effect(() => {
		if (editing) tagText = [...(areaName ? [`!${areaName}`] : []), ...p.tags.map((x) => `#${x}`)].join(', ') + (areaName || p.tags.length ? ', ' : '');
	});
	const closed = $derived(p.state === 'completed' || p.state === 'trash');

	const STATES = [
		['active', 'Ativo'],
		['later', 'Depois'],
		['scheduled', 'Agendado'],
		['someday', 'Algum dia']
	];

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget as HTMLFormElement);
		const body: Record<string, string> = { id: String(p.id) };
		fd.forEach((v, k) => (body[k] = String(v)));
		error = (await postAction('updateProject', body)) ?? '';
		if (!error) editing = false;
	}

	function cancel() {
		error = '';
		editing = false;
	}

	async function reopen() {
		error = (await postAction('updateProject', { id: p.id, reopen: '1' })) ?? '';
	}

	async function trash() {
		if (!confirm(t('Enviar este projeto e suas ações abertas para a lixeira?'))) return;
		error = (await postAction('updateProject', { id: p.id, trash: '1' })) ?? '';
		if (!error) editing = false;
	}

	async function restore() {
		error = (await postAction('updateProject', { id: p.id, restore: '1' })) ?? '';
	}

	async function purge() {
		if (!confirm(t('Excluir definitivamente? Isso não pode ser desfeito.'))) return;
		error = (await postAction('updateProject', { id: p.id, purge: '1' }, '/inbox')) ?? '';
		if (!error) await goto('/trash');
	}

	async function complete() {
		error = (await postAction('updateProject', { id: p.id, complete: '1' })) ?? '';
	}
</script>

<svelte:head><title>{p.name} · GTDone</title></svelte:head>

{#if !closed}
	{#if !editing}
		<div class="card">
			<input type="checkbox" aria-label={t('Concluir projeto')} onchange={complete} />
			<button class="title" onclick={() => (editing = true)}>{p.name}{#if p.notes}<span class="muted" title={t('Tem notas')}> ✎</span>{/if}</button>
			{#if p.dueAt}<span class="muted small">{t('Prazo')}: {toDateInput(p.dueAt)}</span>{/if}
			<button class="ghost" aria-label={t('Editar projeto')} aria-expanded="false" onclick={() => (editing = true)}>▾</button>
		</div>
		{#if p.desiredOutcome}<p class="outcome">🎯 {p.desiredOutcome}</p>{/if}
	{:else}
		<form class="card edit" onsubmit={save}>
			<div class="main">
				<!-- svelte-ignore a11y_autofocus -->
				<input name="name" value={p.name} required autofocus aria-label={t('Nome')} />
				<input name="desiredOutcome" value={p.desiredOutcome} placeholder={t('Resultado desejado')} />
				<TagInput
					bind:value={tagText}
					areas={data.areas}
					contacts={data.contacts}
					tags={data.tags}
					allowContacts={false}
					removableBadges
					placeholder={t('Tags (áreas, contatos, contextos) separadas por vírgula')}
				/>
				<textarea name="notes" rows="6" placeholder={t('Notas')}>{p.notes}</textarea>
				{#if error}<p class="error">{t.msg(error)}</p>{/if}
				<div class="actions">
					<button type="submit">{t('Salvar')}</button>
					<button type="button" class="ghost" onclick={cancel}>{t('Cancelar')}</button>
					<button type="button" class="ghost" onclick={complete}>{t('Concluir projeto')}</button>
					<button type="button" class="ghost danger" onclick={trash}>{t('Excluir projeto')}</button>
				</div>
			</div>
			<div class="side">
				<label>{t('Prazo')} <input type="date" name="dueAt" value={toDateInput(p.dueAt)} /></label>
				<label>{t('Estado')}
					<select name="state">
						{#each STATES as [v, l] (v)}<option value={v} selected={p.state === v}>{t(l)}</option>{/each}
					</select>
				</label>
				<label>{t('Início')} <input type="date" name="startsAt" value={toDateInput(p.startsAt)} /></label>
				<label>{t('Execução')}
					<select name="executionMode">
						<option value="parallel" selected={p.executionMode === 'parallel'}>{t('Paralela')}</option>
						<option value="sequential" selected={p.executionMode === 'sequential'}>{t('Sequencial')}</option>
					</select>
				</label>
				<GoalPicker kind="project" id={p.id} />
			</div>
		</form>
	{/if}
	{#if p.stalled}<p class="warn">{t('Projeto ativo sem próxima ação — defina a próxima ação abaixo.')}</p>{/if}
	{#if p.executionMode === 'sequential' && !editing}<p class="muted">{t('Execução sequencial: só a primeira ação aberta fica disponível em Próximas.')}</p>{/if}
	{#if prefs().rapidEntry === 'show'}<RapidEntry listState="next" placeholder={t('Nova ação do projeto…')} projectId={p.id} />{/if}
{:else}
	<div class="card">
		<span class="title static">{p.name}</span>
	</div>
	<p class="muted">{p.state === 'completed' ? t('Projeto concluído.') : t('Projeto na lixeira.')}</p>
	{#if p.state === 'completed'}<button class="ghost" onclick={reopen}>{t('Reabrir projeto')}</button>{/if}
	{#if p.state === 'trash'}
		<button class="ghost" onclick={restore}>{t('Restaurar')}</button>
		<button class="ghost danger" onclick={purge}>{t('Excluir definitivamente')}</button>
	{/if}
	{#if error}<p class="error">{t.msg(error)}</p>{/if}
{/if}

<ItemList
	items={data.items}
	today={data.today}
	projects={data.projects}
	areas={data.areas}
	contacts={data.contacts}
	tags={data.tags}
	emptyText={t('Nenhuma ação neste projeto.')}
	groupBy="state"
	limitPerGroup={10}
/>

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
	.card .title {
		all: unset;
		flex: 1;
		cursor: pointer;
		font-size: 1.15rem;
		font-weight: 600;
	}
	.card .title.static {
		cursor: default;
	}
	.card.edit {
		align-items: flex-start;
		gap: 1rem;
	}
	.edit .main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}
	.edit .side {
		width: 12rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.outcome,
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 0.8rem;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.8rem;
		color: var(--muted);
		gap: 0.3rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.warn,
	.error {
		color: var(--danger);
	}
	@media (max-width: 700px) {
		.card.edit {
			flex-direction: column;
		}
		.edit .side {
			width: 100%;
		}
	}
</style>
