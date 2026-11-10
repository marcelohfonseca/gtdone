<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import { LIST_META, STATE_LISTS } from '#lib/gtd/core.ts';
	import { dueInfo, extractLinks, linkHost, minutesLabel, recurrenceLabel } from '#lib/format.ts';
	import { usePrefs, useT } from '#lib/prefs-context.ts';
	import type { Item } from '#lib/gtd/items.ts';
	import ItemEditor from './ItemEditor.svelte';

	type Named = { id: number; name: string; color?: string | null };
	let {
		item,
		today,
		projects,
		areas,
		contacts,
		tags,
		showProject = true,
		onmove
	}: {
		item: Item;
		today: number;
		projects: Named[];
		areas: Named[];
		contacts: Named[];
		tags: Named[];
		showProject?: boolean;
		onmove?: (id: number, dir: -1 | 1) => void;
	} = $props();

	const prefs = usePrefs();
	const t = useT();
	let open = $state(false);
	let menu = $state(false);
	let error = $state('');
	const archived = $derived(item.state === 'trash' || item.state === 'completed');
	const due = $derived(
		dueInfo(item.dueAt, today, {
			format: prefs().dateFormat,
			absolute: prefs().dueDisplay === 'absolute',
			lang: prefs().lang
		})
	);
	const startLabel = $derived.by(() => {
		if (item.state !== 'scheduled' || item.startsAt == null) return '';
		const sameYear = new Date(item.startsAt).getUTCFullYear() === new Date(today).getUTCFullYear();
		const month = new Intl.DateTimeFormat(prefs().lang, { timeZone: 'UTC', month: 'short' })
			.format(item.startsAt)
			.replace('.', '');
		const day = new Date(item.startsAt).getUTCDate();
		const year = sameYear ? '' : ` ${new Date(item.startsAt).getUTCFullYear()}`;
		return `${day} ${month.charAt(0).toUpperCase()}${month.slice(1)}${year}`;
	});
	const tagColor = (name: string) => tags.find((x) => x.name === name)?.color ?? null;
	const contactColor = $derived(contacts.find((c) => c.id === item.contactId)?.color ?? null);
	const areaColor = $derived(item.areaId == null ? null : (areas.find((a) => a.id === item.areaId)?.color ?? null));
	const checkDone = $derived(item.checklist.filter((c) => c.done).length);

	async function run(name: string, data: Record<string, string | number> = {}) {
		menu = false;
		error = (await postAction(name, { id: item.id, ...data })) ?? '';
	}

	async function schedule() {
		const date = prompt(t('Data de início (AAAA-MM-DD):'));
		if (date) await run('move', { state: 'scheduled', startsAt: date });
	}
</script>

<div
	class="row"
	class:done={item.state === 'completed'}
	class:colored={areaColor}
	style:--area={areaColor}
	data-id={item.id}
>
	<span class="handle" title={t('Arrastar para reordenar')}>⋮⋮</span>
	{#if item.kind === 'task' && item.state !== 'trash'}
		<input
			type="checkbox"
			checked={item.state === 'completed'}
			aria-label={t('Concluir')}
			onchange={() => run(item.state === 'completed' ? 'restore' : 'complete')}
		/>
	{:else if item.kind === 'reference'}
		<span class="badge" title={t('Referência')}>📎</span>
	{/if}
	<button class="title" onclick={() => (open = !open)}>
		{#if startLabel}<span class="startdate" title={t('Data de início')}>{startLabel}</span>{/if}
		{#if item.contactName}<span class="startdate" class:tinted={contactColor} style:--tint={contactColor} title={t('Contato')}>{item.contactName}</span>{/if}
		{item.title}
		{#if item.notes}<span class="muted" title={t('Tem notas')}> ✎</span>{/if}
	</button>
	{#each extractLinks(item.notes).slice(0, 3) as url (url)}
		<a class="muted small" href={url} target="_blank" rel="noopener noreferrer" title={url}>🔗 {linkHost(url)}</a>
	{/each}
	{#if item.checklist.length}
		<span class="muted small" title={t('Checklist')}>☑ {checkDone}/{item.checklist.length}</span>
	{/if}
	{#if item.recurrence}<span class="muted small" title={recurrenceLabel(item.recurrence, prefs().lang)}>🔁</span>{/if}
	{#if showProject && item.projectName}
		<a class="chip" href={`/projects/${item.projectId}`}>{item.projectName}</a>
	{/if}
	{#each item.tags as tag (tag)}<span class="chip tag" class:tinted={tagColor(tag)} style:--tint={tagColor(tag)}>#{tag}</span>{/each}
	{#if item.minutes}<span class="muted small">{minutesLabel(item.minutes, prefs().lang)}</span>{/if}
	{#if due}<span class="due" class:late={due.late}>{due.text}</span>{/if}
	{#if !archived}
		<button
			class="star"
			class:on={item.starred}
			aria-label={item.starred ? t('Remover do Foco') : t('Adicionar ao Foco')}
			onclick={() => run('star', { starred: item.starred ? 0 : 1 })}>★</button
		>
	{/if}
	<div class="menu-wrap">
		<button class="ghost" aria-label={t('Mais ações')} onclick={() => (menu = !menu)}>▾</button>
		{#if menu}
			<div class="menu" role="menu">
				<button role="menuitem" onclick={() => run('duplicate')}>{t('Duplicar')}</button>
				{#if archived}
					<button role="menuitem" onclick={() => run('restore')}>{t('Restaurar')}</button>
					{#if item.state === 'trash'}
						<button
							role="menuitem"
							class="danger"
							onclick={() => confirm(t('Excluir definitivamente? Isso não pode ser desfeito.')) && run('deleteForever')}
							>{t('Excluir definitivamente')}</button
						>
					{/if}
				{:else}
					{#each STATE_LISTS.filter((s) => s !== 'scheduled' && s !== item.state) as s (s)}
						<button role="menuitem" onclick={() => run('move', { state: s })}>
							{t('Mover para {list}', { list: t(LIST_META[s].label) })}
						</button>
					{/each}
					<button role="menuitem" onclick={schedule}>{t('Agendar…')}</button>
					<button role="menuitem" onclick={() => run('kind', { kind: item.kind === 'task' ? 'reference' : 'task' })}>
						{item.kind === 'task' ? t('Converter em referência') : t('Converter em ação')}
					</button>
					<button role="menuitem" onclick={() => run('toProject')}>{t('Transformar em projeto')}</button>
					{#if onmove}
						<button role="menuitem" onclick={() => { menu = false; onmove(item.id, -1); }}>{t('Subir')}</button>
						<button role="menuitem" onclick={() => { menu = false; onmove(item.id, 1); }}>{t('Descer')}</button>
					{/if}
					<button role="menuitem" class="danger" onclick={() => run('trash')}>{t('Excluir')}</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
{#if error}<p class="error">{t.msg(error)}</p>{/if}
{#if open}
	<ItemEditor {item} {projects} {areas} {contacts} {tags} onclose={() => (open = false)} />
{/if}

<style>
	.chip.tinted,
	.startdate.tinted {
		background: color-mix(in srgb, var(--tint) 22%, transparent);
		color: var(--tint);
	}
	.startdate {
		font-size: 0.8rem;
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		color: var(--accent);
		border-radius: 4px;
		padding: 0.08rem 0.45rem;
		margin-right: 0.35rem;
		white-space: nowrap;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--row-gap);
		padding: var(--row-pad) 0.5rem;
		font-size: var(--row-font);
		border-bottom: 1px solid var(--border);
		position: relative;
	}
	.row.colored {
		box-shadow: inset 3px 0 0 var(--area);
	}
	.row.done .title {
		text-decoration: line-through;
		color: var(--muted);
	}
	.handle {
		cursor: grab;
		color: var(--muted);
		user-select: none;
		font-size: 0.85rem;
	}
	.title {
		flex: 1;
		text-align: left;
		background: none;
		border: none;
		color: inherit;
		padding: 0;
		font: inherit;
		cursor: pointer;
	}
	.chip {
		font-size: 0.8rem;
		padding: 0.15rem 0.55rem;
		border-radius: 1rem;
		background: var(--surface-2);
		color: var(--muted);
		text-decoration: none;
	}
	.small {
		font-size: 0.8rem;
	}
	.due {
		font-size: 0.8rem;
		color: var(--muted);
	}
	.due.late {
		color: var(--danger);
	}
	.star {
		background: none;
		border: none;
		color: var(--muted);
		cursor: pointer;
		font-size: 1rem;
	}
	.star.on {
		color: #e8b400;
	}
	.menu-wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 20;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		min-width: 14rem;
		display: flex;
		flex-direction: column;
		box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
	}
	.menu button {
		background: none;
		border: none;
		color: inherit;
		text-align: left;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
		font: inherit;
	}
	.menu button:hover {
		background: var(--surface-2);
	}
	.menu .danger {
		color: var(--danger);
	}
	.error {
		color: var(--danger);
		font-size: 0.9rem;
		margin: 0.2rem 0;
	}
</style>
