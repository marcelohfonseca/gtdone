<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import { toDateInput, LIST_META, STATE_LISTS } from '#lib/gtd/core.ts';
	import { TIME_OPTIONS, extractLinks } from '#lib/format.ts';
	import type { Item } from '#lib/gtd/items.ts';
	import GoalPicker from './GoalPicker.svelte';
	import { useT } from '#lib/prefs-context.ts';

	const t = useT();

	type Named = { id: number; name: string };
	let {
		item,
		projects,
		areas,
		contacts,
		tags,
		onclose
	}: {
		item: Item;
		projects: Named[];
		areas: Named[];
		contacts: Named[];
		tags: Named[];
		onclose: () => void;
	} = $props();

	let error = $state('');
	let newStep = $state('');
	const rec = $derived((item.recurrence ?? ':1').split(':'));
	const links = $derived(extractLinks(item.notes));
	let busy = $state(false);
	const readOnly = $derived(item.state === 'trash' || item.state === 'completed');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		const fd = new FormData(e.currentTarget as HTMLFormElement);
		const data: Record<string, string> = { id: String(item.id) };
		fd.forEach((v, k) => (data[k] = String(v)));
		data.starred = item.starred ? '1' : '0';
		data.recurrence = data.recUnit ? `${data.recUnit}:${data.recEvery || 1}` : '';
		delete data.recUnit;
		delete data.recEvery;
		const err = await postAction('edit', data);
		busy = false;
		if (err) error = err;
		else onclose();
	}

	async function step(name: string, data: Record<string, string | number>) {
		error = (await postAction(name, data)) ?? '';
	}

	async function addStep() {
		if (!newStep.trim()) return;
		await step('checkAdd', { id: item.id, title: newStep });
		newStep = '';
	}
</script>

<form class="editor" onsubmit={submit}>
	<div class="cols">
	<div class="main">
	<input name="title" value={item.title} required aria-label={t('Título')} disabled={readOnly} />
	<input name="tags" list="tag-options" value={item.tags.join(', ')} placeholder={t('Tags (áreas, contatos, contextos) separadas por vírgula')} aria-label={t('Tags')} disabled={readOnly} />
	<textarea name="notes" rows="6" placeholder={t('Notas')} disabled={readOnly}>{item.notes}</textarea>
	{#if links.length}
		<p class="links">
			{t('Links:')}
			{#each links as url (url)}
				<a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
			{/each}
		</p>
	{/if}
	<div class="checklist">
		<span class="cap">{t('Checklist')}</span>
		{#each item.checklist as c (c.id)}
			<div class="step">
				<input
					type="checkbox"
					checked={c.done}
					aria-label={c.title}
					onchange={(e) => step('checkToggle', { id: c.id, done: e.currentTarget.checked ? 1 : 0 })}
				/>
				<span class:done={c.done}>{c.title}</span>
				<button type="button" class="ghost" aria-label={t('Remover passo')} onclick={() => step('checkRemove', { id: c.id })}>×</button>
			</div>
		{/each}
		{#if !readOnly}
			<input
				placeholder={t('Novo passo (Enter para adicionar)')}
				bind:value={newStep}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						void addStep();
					}
				}}
			/>
		{/if}
	</div>
	<div class="actions">
		{#if !readOnly}<button type="submit" disabled={busy}>{t('Salvar')}</button>{/if}
		<button type="button" class="ghost" onclick={onclose}>{t('Cancelar')}</button>
	</div>
	{#if error}<p class="error">{t.msg(error)}</p>{/if}
	</div>
	<div class="grid side">
		<label>
			{t('Tempo')}
			<select name="minutes" disabled={readOnly}>
				<option value="">—</option>
				{#each TIME_OPTIONS as o (o.value)}
					<option value={o.value} selected={item.minutes === o.value}>{o.label}</option>
				{/each}
			</select>
		</label>
		<label>
			{t('Energia')}
			<select name="energy" disabled={readOnly}>
				<option value="">—</option>
				<option value="low" selected={item.energy === 'low'}>{t('Baixa')}</option>
				<option value="medium" selected={item.energy === 'medium'}>{t('Média')}</option>
				<option value="high" selected={item.energy === 'high'}>{t('Alta')}</option>
			</select>
		</label>
		<label>
			{t('Prazo')}
			<input type="date" name="dueAt" value={toDateInput(item.dueAt)} disabled={readOnly} />
		</label>
		<label>
			{t('Repetir')}
			<select name="recUnit" disabled={readOnly}>
				<option value="">{t('Não repetir')}</option>
				<option value="daily" selected={rec[0] === 'daily'}>{t('Dias')}</option>
				<option value="weekly" selected={rec[0] === 'weekly'}>{t('Semanas')}</option>
				<option value="monthly" selected={rec[0] === 'monthly'}>{t('Meses')}</option>
				<option value="yearly" selected={rec[0] === 'yearly'}>{t('Anos')}</option>
			</select>
		</label>
		<label>
			{t('A cada')}
			<input type="number" name="recEvery" min="1" max="365" value={rec[1] || 1} disabled={readOnly} />
		</label>
		<label>
			{t('Início')}
			<input type="date" name="startsAt" value={toDateInput(item.startsAt)} disabled={readOnly} />
		</label>
		<label>
			{t('Lista')}
			<select name="state" disabled={readOnly}>
				{#each STATE_LISTS as s (s)}
					<option value={s} selected={item.state === s}>{t(LIST_META[s].label)}</option>
				{/each}
			</select>
		</label>
		<label>
			{t('Projeto')}
			<select name="projectId" disabled={readOnly}>
				<option value="">{t('Avulsa')}</option>
				{#each projects as p (p.id)}
					<option value={p.id} selected={item.projectId === p.id}>{p.name}</option>
				{/each}
			</select>
		</label>
		<label>
			{t('Área')}
			<select name="areaId" disabled={readOnly}>
				<option value="">{t('Nenhuma')}</option>
				{#each areas as a (a.id)}
					<option value={a.id} selected={item.areaId === a.id}>{a.name}</option>
				{/each}
			</select>
		</label>
		<label>
			{t('Delegada a')}
			<select name="contactId" disabled={readOnly}>
				<option value="">—</option>
				{#each contacts as c (c.id)}
					<option value={c.id} selected={item.contactId === c.id}>{c.name}</option>
				{/each}
			</select>
		</label>
		<GoalPicker kind="item" id={item.id} disabled={readOnly} />
	</div>
	<datalist id="tag-options">
		{#each tags as tg (tg.id)}<option value={tg.name}></option>{/each}
	</datalist>
	</div>
</form>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem;
		background: var(--surface-2);
		border-radius: 0.5rem;
		margin: 0.25rem 0 0.5rem;
	}
	.cols {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.grid.side {
		width: 13rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	@media (max-width: 700px) {
		.cols {
			flex-direction: column;
		}
		.grid.side {
			width: 100%;
		}
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.cap {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.checklist {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.step {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.step span {
		flex: 1;
	}
	.step span.done {
		text-decoration: line-through;
		color: var(--muted);
	}
	.links {
		margin: 0;
		font-size: 0.8rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.75rem;
		overflow-wrap: anywhere;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.error {
		color: var(--danger);
		margin: 0;
		font-size: 0.85rem;
	}
</style>
