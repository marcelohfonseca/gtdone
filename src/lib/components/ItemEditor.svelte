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
	const links = $derived(extractLinks(item.notes));
	let busy = $state(false);
	const areaName = $derived(areas.find((a) => a.id === item.areaId)?.name);
	const readOnly = $derived(item.state === 'trash' || item.state === 'completed');

	// Menu de estado/reagendamento: os valores vivem em campos ocultos enviados com o formulário.
	// svelte-ignore state_referenced_locally
	let st = $state(item.state as string);
	// svelte-ignore state_referenced_locally
	let startsAt = $state(toDateInput(item.startsAt));
	// svelte-ignore state_referenced_locally
	let contactId = $state(item.contactId == null ? '' : String(item.contactId));
	// svelte-ignore state_referenced_locally
	let recUnit = $state((item.recurrence ?? ':1').split(':')[0]);
	// svelte-ignore state_referenced_locally
	let recEvery = $state((item.recurrence ?? ':1').split(':')[1] || '1');
	let menuOpen = $state(false);
	let sub = $state<'' | 'start' | 'repeat' | 'waiting' | 'scheduled'>('');
	let wrap = $state<HTMLElement>();
	const todayStr = new Date().toISOString().slice(0, 10);
	const MENU_STATES = STATE_LISTS.filter((l) => l !== 'waiting' && l !== 'scheduled');
	const contactName = $derived(contacts.find((c) => String(c.id) === contactId)?.name);
	const stateLabel = $derived.by(() => {
		const base = t(LIST_META[st as keyof typeof LIST_META]?.label ?? st);
		if (st === 'waiting' && contactName) return `${base} · ${contactName}`;
		if (st === 'scheduled' && startsAt) return `${base} · ${startsAt}`;
		return base;
	});

	function pickState(next: string) {
		st = next;
		if (next !== 'waiting') contactId = '';
		if ((next === 'next' || next === 'later') && startsAt > todayStr) startsAt = '';
		menuOpen = false;
		sub = '';
	}
	function pickContact(id: string) {
		st = 'waiting';
		contactId = id;
		menuOpen = false;
		sub = '';
	}
	function setStart(value: string) {
		startsAt = value;
		if (value && value > todayStr && (st === 'next' || st === 'later')) st = 'scheduled';
		if (!value && st === 'scheduled') st = 'next';
	}
	async function newContact() {
		const name = prompt(t('Nome do contato:'))?.trim();
		if (!name) return;
		const err = await postAction('create', { name }, '/manage/contacts');
		if (err) return void (error = err);
		const made = contacts.find((c) => c.name === name);
		if (made) pickContact(String(made.id));
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		const fd = new FormData(e.currentTarget as HTMLFormElement);
		const data: Record<string, string> = { id: String(item.id) };
		fd.forEach((v, k) => (data[k] = String(v)));
		data.starred = item.starred ? '1' : '0';
		data.recurrence = recUnit ? `${recUnit}:${recEvery || 1}` : '';
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

<svelte:window onclick={(e) => { if (menuOpen && wrap && !wrap.contains(e.target as Node)) menuOpen = false; }} />

<form class="editor" onsubmit={submit}>
	<div class="cols">
	<div class="main">
	<input name="title" value={item.title} required aria-label={t('Título')} disabled={readOnly} />
	<input name="tags" list="tag-options" value={[...(areaName ? [areaName] : []), ...item.tags].join(', ')} placeholder={t('Tags (áreas, contatos, contextos) separadas por vírgula')} aria-label={t('Tags')} disabled={readOnly} />
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
		<div class="statebox" bind:this={wrap}>
			<span class="cap">{t('Estado')}</span>
			<button type="button" class="trigger" disabled={readOnly} aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
				<span>{stateLabel}</span><span aria-hidden="true">▾</span>
			</button>
			{#if recUnit}<span class="cap">🔁 {t('A cada')} {recEvery} · {t(({ daily: 'Dias', weekly: 'Semanas', monthly: 'Meses', yearly: 'Anos' } as Record<string, string>)[recUnit] ?? recUnit)}</span>{/if}
			<input type="hidden" name="state" value={st} />
			<input type="hidden" name="startsAt" value={startsAt} />
			<input type="hidden" name="contactId" value={contactId} />
			{#if menuOpen}
				<div class="menu" role="menu">
					<div class="mhead">{t('Reagendar')}</div>
					<button type="button" role="menuitem" onclick={() => (sub = sub === 'start' ? '' : 'start')}>{t('Data de início…')}</button>
					{#if sub === 'start'}
						<div class="inline">
							<input type="date" value={startsAt} onchange={(e) => setStart(e.currentTarget.value)} />
							{#if startsAt}<button type="button" class="ghost" onclick={() => setStart('')}>{t('Remover data')}</button>{/if}
						</div>
					{/if}
					<button type="button" role="menuitem" onclick={() => (sub = sub === 'repeat' ? '' : 'repeat')}>{t('Repetir…')}</button>
					{#if sub === 'repeat'}
						<div class="inline">
							<select bind:value={recUnit}>
								<option value="">{t('Não repetir')}</option>
								<option value="daily">{t('Dias')}</option>
								<option value="weekly">{t('Semanas')}</option>
								<option value="monthly">{t('Meses')}</option>
								<option value="yearly">{t('Anos')}</option>
							</select>
							{#if recUnit}<input type="number" min="1" max="365" bind:value={recEvery} aria-label={t('A cada')} />{/if}
						</div>
					{/if}
					<div class="mhead">{t('Estado')}</div>
					{#each MENU_STATES as l (l)}
						<button type="button" role="menuitem" class:cur={st === l} onclick={() => pickState(l)}>
							<span class="chk">{st === l ? '✓' : ''}</span>{t(LIST_META[l].label)}
						</button>
					{/each}
					<button type="button" role="menuitem" class:cur={st === 'waiting'} onclick={() => (sub = sub === 'waiting' ? '' : 'waiting')}>
						<span class="chk">{st === 'waiting' ? '✓' : ''}</span>{t(LIST_META.waiting.label)} <span class="arrow">{sub === 'waiting' ? '▾' : '▸'}</span>
					</button>
					{#if sub === 'waiting'}
						<div class="inline col">
							<span class="cap">{t('Aguardando com')}</span>
							{#each contacts as c (c.id)}
								<button type="button" role="menuitem" class:cur={contactId === String(c.id)} onclick={() => pickContact(String(c.id))}>{c.name}</button>
							{/each}
							<button type="button" role="menuitem" onclick={newContact}>{t('Novo contato…')}</button>
						</div>
					{/if}
					<button type="button" role="menuitem" class:cur={st === 'scheduled'} onclick={() => (sub = sub === 'scheduled' ? '' : 'scheduled')}>
						<span class="chk">{st === 'scheduled' ? '✓' : ''}</span>{t(LIST_META.scheduled.label)} <span class="arrow">{sub === 'scheduled' ? '▾' : '▸'}</span>
					</button>
					{#if sub === 'scheduled'}
						<div class="inline col">
							<span class="cap">{t('Agendar para')}</span>
							<input type="date" value={startsAt} onchange={(e) => { setStart(e.currentTarget.value); if (e.currentTarget.value) { st = 'scheduled'; contactId = ''; } }} />
						</div>
					{/if}
				</div>
			{/if}
		</div>
		<label>
			{t('Projeto')}
			<select name="projectId" disabled={readOnly}>
				<option value="">{t('Avulsa')}</option>
				{#each projects as p (p.id)}
					<option value={p.id} selected={item.projectId === p.id}>{p.name}</option>
				{/each}
			</select>
		</label>
		<GoalPicker kind="item" id={item.id} disabled={readOnly} />
	</div>
	<datalist id="tag-options">
		{#each areas as a (a.id)}<option value={a.name}></option>{/each}
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
	.statebox {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.trigger {
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border);
		font: inherit;
		font-size: 0.9rem;
		padding: 0.45rem 0.6rem;
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		align-items: center;
		text-align: left;
	}
	.menu {
		position: absolute;
		top: 100%;
		right: 0;
		z-index: 20;
		min-width: 15rem;
		margin-top: 0.2rem;
		padding: 0.3rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
		display: flex;
		flex-direction: column;
	}
	.menu button[role='menuitem'] {
		all: unset;
		cursor: pointer;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.5rem;
		font-size: 0.85rem;
		color: var(--text);
		border-radius: 4px;
	}
	.menu button[role='menuitem']:hover {
		background: var(--surface-2);
	}
	.menu .cur {
		font-weight: 600;
	}
	.chk {
		width: 1rem;
		color: var(--accent);
	}
	.arrow {
		margin-left: auto;
		color: var(--muted);
	}
	.mhead {
		padding: 0.3rem 0.5rem 0.1rem;
		font-size: 0.7rem;
		font-style: italic;
		color: var(--muted);
	}
	.inline {
		display: flex;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem 0.4rem 1.2rem;
		align-items: center;
	}
	.inline.col {
		flex-direction: column;
		align-items: stretch;
		padding-left: 1.5rem;
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
