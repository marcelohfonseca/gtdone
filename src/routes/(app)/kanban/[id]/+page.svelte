<script lang="ts">
	import { goto } from '$app/navigation';
	import { postAction } from '#lib/client/actions.ts';
	import { toDateInput } from '#lib/gtd/core.ts';
	import { BOARD_STATES } from '#lib/gtd/kanban.ts';
	import { useT } from '#lib/prefs-context.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = useT();
	let error = $state('');
	let settings = $state(false);
	let overKey = $state<string | null>(null);
	let newColumn = $state('');
	let newState = $state('');

	const board = $derived(data.view.board);
	const columns = $derived(data.view.columns);
	const editable = $derived(board.groupBy === 'state' || board.groupBy === 'custom');
	const STATE_LABEL: Record<string, string> = {
		inbox: 'Entrada',
		next: 'Próximas',
		waiting: 'Aguardando',
		later: 'Depois',
		scheduled: 'Agendadas',
		someday: 'Algum dia',
		completed: 'Concluídas'
	};
	const GROUPINGS = [
		['state', 'Estado (lista GTD)'],
		['project', 'Projeto'],
		['area', 'Área'],
		['custom', 'Colunas personalizadas']
	] as const;
	const freeStates = $derived(BOARD_STATES.filter((s) => !columns.some((c) => c.key === s)));

	async function run(name: string, body: Record<string, string | number>) {
		error = (await postAction(name, body)) ?? '';
		return !error;
	}

	function move(itemId: number, column: string) {
		return run('boardMove', { boardId: board.id, itemId, column });
	}

	function drop(e: DragEvent, key: string) {
		overKey = null;
		const id = Number(e.dataTransfer?.getData('application/x-gtdone-card'));
		if (id) void move(id, key);
	}

	async function saveBoard(e: SubmitEvent) {
		e.preventDefault();
		const body: Record<string, string> = { id: String(board.id) };
		new FormData(e.currentTarget as HTMLFormElement).forEach((v, k) => (body[k] = String(v)));
		await run('updateBoard', body);
	}

	async function removeBoard() {
		if (!confirm(t('Excluir este quadro? As ações não são apagadas.'))) return;
		if (await run('deleteBoard', { id: board.id })) await goto('/kanban');
	}

	async function addColumn(e: SubmitEvent) {
		e.preventDefault();
		const name = newColumn.trim() || (board.groupBy === 'state' ? STATE_LABEL[newState] : '');
		if (await run('boardColumn', { op: 'add', boardId: board.id, name, stateKey: newState })) newColumn = newState = '';
	}
</script>

<svelte:head><title>{board.name} · Kanban · GTDone</title></svelte:head>

<div class="head">
	<h1>🗂️ {board.name}</h1>
	<button class="ghost" aria-expanded={settings} onclick={() => (settings = !settings)}>⚙ {t('Configurar')}</button>
</div>

{#if settings}
	<div class="panel">
		<form class="row" onsubmit={saveBoard}>
			<label>{t('Nome')} <input name="name" value={board.name} required /></label>
			<label>
				{t('Agrupar por')}
				<select name="groupBy">
					{#each GROUPINGS as [v, l] (v)}<option value={v} selected={board.groupBy === v}>{t(l)}</option>{/each}
				</select>
			</label>
			<label>
				{t('Apenas o projeto')}
				<select name="projectId">
					<option value="">{t('Todos os projetos')}</option>
					{#each data.projects as p (p.id)}<option value={String(p.id)} selected={board.projectId === p.id}>{p.name}</option>{/each}
				</select>
			</label>
			<button type="submit">{t('Salvar')}</button>
			<button type="button" class="ghost" onclick={removeBoard}>{t('Excluir')}</button>
		</form>
		<p class="muted small">{t('Trocar o agrupamento recria as colunas.')}</p>

		{#if editable}
			<h3>{t('Colunas')}</h3>
			{#each columns as c, i (c.key)}
				<div class="colrow">
					<input
						value={c.name}
						aria-label={t('Nome da coluna')}
						onchange={(e) => run('boardColumn', { op: 'rename', boardId: board.id, columnId: c.id ?? '', name: e.currentTarget.value })}
					/>
					{#if board.groupBy === 'state'}<span class="muted small">{t(STATE_LABEL[c.key] ?? c.key)}</span>{/if}
					<button class="ghost" disabled={i === 0} aria-label={t('Mover para a esquerda')} onclick={() => run('boardColumn', { op: 'left', boardId: board.id, columnId: c.id ?? '' })}>←</button>
					<button class="ghost" disabled={i === columns.length - 1} aria-label={t('Mover para a direita')} onclick={() => run('boardColumn', { op: 'right', boardId: board.id, columnId: c.id ?? '' })}>→</button>
					<button class="ghost" aria-label={t('Remover coluna')} onclick={() => run('boardColumn', { op: 'remove', boardId: board.id, columnId: c.id ?? '' })}>×</button>
				</div>
			{/each}
			<form class="colrow" onsubmit={addColumn}>
				{#if board.groupBy === 'state'}
					<select bind:value={newState} aria-label={t('Estado')} required>
						<option value="">{t('Estado…')}</option>
						{#each freeStates as s (s)}<option value={s}>{t(STATE_LABEL[s])}</option>{/each}
					</select>
				{/if}
				<input bind:value={newColumn} placeholder={t('Nome da nova coluna')} aria-label={t('Nome da nova coluna')} required={board.groupBy === 'custom'} />
				<button type="submit">{t('Adicionar coluna')}</button>
			</form>
		{/if}
	</div>
{/if}
{#if error}<p class="error">{t.msg(error)}</p>{/if}

<div class="board">
	{#each columns as col (col.key)}
		<section
			class="col"
			class:over={overKey === col.key}
			aria-label={col.name}
			ondragover={(e) => {
				e.preventDefault();
				overKey = col.key;
			}}
			ondragleave={() => (overKey = null)}
			ondrop={(e) => drop(e, col.key)}
		>
			<h3>{col.name} <span class="muted small">{col.items.length}</span></h3>
			{#each col.items as item (item.id)}
				<article
					class="card"
					class:done={item.state === 'completed'}
					draggable="true"
					ondragstart={(e) => e.dataTransfer?.setData('application/x-gtdone-card', String(item.id))}
				>
					<span class="title">{item.title}</span>
					<span class="meta">
						{#if item.projectName && !board.projectId && board.groupBy !== 'project'}<span class="chip">{item.projectName}</span>{/if}
						{#if item.dueAt}<span class="chip">{toDateInput(item.dueAt)}</span>{/if}
						{#each item.tags as tg (tg)}<span class="chip">#{tg}</span>{/each}
					</span>
					<select aria-label={t('Mover para')} onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) void move(item.id, v); }}>
						<option value="">{t('Mover para…')}</option>
						{#each columns.filter((c) => c.key !== col.key) as c (c.key)}<option value={c.key}>{c.name}</option>{/each}
					</select>
				</article>
			{/each}
		</section>
	{:else}
		<p class="muted">{t('Este quadro não tem colunas. Abra Configurar para adicionar.')}</p>
	{/each}
</div>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.head h1 {
		margin: 0;
	}
	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 0.8rem 1rem;
		margin: 0.75rem 0;
	}
	.row,
	.colrow {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		flex-wrap: wrap;
		margin-bottom: 0.4rem;
	}
	.colrow {
		align-items: center;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.75rem;
		color: var(--muted);
		gap: 0.2rem;
	}
	.board {
		display: flex;
		gap: 0.75rem;
		overflow-x: auto;
		align-items: flex-start;
		padding-bottom: 1rem;
	}
	.col {
		flex: 0 0 16rem;
		background: var(--surface-2);
		border-radius: 10px;
		padding: 0.5rem;
		min-height: 6rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.col.over {
		outline: 2px dashed var(--accent, #1f7a5a);
	}
	.col h3 {
		margin: 0.2rem 0.2rem 0.4rem;
		font-size: 0.85rem;
	}
	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.5rem 0.6rem;
		cursor: grab;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.card.done .title {
		text-decoration: line-through;
		color: var(--muted);
	}
	.card select {
		font-size: 0.75rem;
	}
	.meta {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.chip {
		font-size: 0.7rem;
		background: var(--surface-2);
		border-radius: 999px;
		padding: 0 0.45rem;
		color: var(--muted);
	}
	.muted {
		color: var(--muted);
	}
	.small {
		font-size: 0.75rem;
	}
	.error {
		color: var(--danger);
	}
</style>
