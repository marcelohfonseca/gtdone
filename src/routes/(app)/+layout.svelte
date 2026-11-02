<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { postAction } from '#lib/client/actions.ts';
	import { LIST_META, type ListName } from '#lib/gtd/core.ts';
	import { MODES, type Mode } from '#lib/modes.ts';
	import Composer from '#lib/components/Composer.svelte';
	import { providePrefs } from '#lib/prefs-context.ts';
	import { GO_KEYS, SHORTCUTS } from '#lib/shortcuts.ts';
	import { tick } from 'svelte';
	import { translate, translateMessage } from '#lib/i18n/index.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	providePrefs(() => data.prefs);
	const t = (text: string, params?: Record<string, string | number>) => translate(data.prefs.lang, text, params);

	let mode = $state<Mode | null>(null);
	let help = $state(false);
	let selectedId = $state<number | null>(null);
	let newMenu = $state(false);
	let settingsMenu = $state(false);
	let sidebarOpen = $state(false);
	let searchInput: HTMLInputElement | undefined = $state();

	const path = $derived(page.url.pathname);
	$effect(() => {
		void path;
		sidebarOpen = false;
		settingsMenu = false;
	});

	$effect(() => {
		const root = document.documentElement;
		root.dataset.theme = data.prefs.theme;
		root.dataset.accent = data.prefs.accent;
		root.dataset.density = data.prefs.density;
		root.lang = data.prefs.lang;
	});

	$effect(() => {
		void path;
		selectedId = null;
	});

	$effect(() => {
		const id = selectedId;
		void data;
		void tick().then(() => {
			for (const r of rows()) r.classList.toggle('kbd-selected', Number(r.dataset.id) === id);
		});
	});

	const tagQuery = $derived(data.filter.tagId ? `?tag=${data.filter.tagId}` : '');

	const GROUP_A = $derived<ListName[]>(
		(['inbox', 'next', 'later', 'waiting', 'scheduled', 'someday'] as ListName[]).filter(
			(l) => !((l === 'later' && data.prefs.later === 'off') || (l === 'waiting' && data.prefs.waiting === 'off'))
		)
	);
	const sidebarProjects = $derived(
		data.sidebarProjects.filter((p) => data.prefs.sequentialSidebar === 'on' || !p.sequential)
	);

	function tagHref(id: number) {
		const next = new URL(page.url.href);
		if (data.filter.tagId === id) next.searchParams.delete('tag');
		else next.searchParams.set('tag', String(id));
		return next.pathname + next.search;
	}

	function badge(list: ListName): number {
		if (data.prefs.counts === 'all' && list in data.counts.lists) {
			return data.counts.lists[list as keyof typeof data.counts.lists];
		}
		if (list === 'inbox') return data.counts.inbox;
		if (list === 'waiting') return data.counts.waiting;
		if (list === 'focus') return data.counts.focus;
		return 0;
	}

	function onKey(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (el.closest('input, textarea, select, dialog, [contenteditable]')) return;
		if (e.key === '/') {
			e.preventDefault();
			searchInput?.focus();
			return;
		}
		if (e.key === '?') {
			e.preventDefault();
			help = !help;
			return;
		}
		if (e.key === 'Escape') help = false;
		if (GO_KEYS[e.key] && !(GO_KEYS[e.key] === '/reference' && data.prefs.reference === 'hide')) {
			e.preventDefault();
			void goto(GO_KEYS[e.key]);
			return;
		}
		if (itemKey(e)) return;
		const found = MODES.find((m) => m.key === e.key.toLowerCase());
		if (found) {
			e.preventDefault();
			mode = found;
			newMenu = false;
		}
	}

	function rows(): HTMLElement[] {
		return [...document.querySelectorAll<HTMLElement>('main .row[data-id]')];
	}

	function select(id: number | null) {
		selectedId = id;
		if (id != null) {
			document.querySelector(`main .row[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
		}
	}

	// Atalhos sobre o item selecionado; devolve true quando a tecla foi tratada.
	function itemKey(e: KeyboardEvent): boolean {
		const key = e.key.toLowerCase();
		const all = rows();
		if (key === 'j' || key === 'k') {
			if (!all.length) return false;
			e.preventDefault();
			const idx = all.findIndex((r) => Number(r.dataset.id) === selectedId);
			const next = key === 'j' ? Math.min(idx + 1, all.length - 1) : Math.max(idx - 1, 0);
			select(Number(all[idx === -1 ? 0 : next].dataset.id));
			return true;
		}
		const row = all.find((r) => Number(r.dataset.id) === selectedId);
		if (!row || selectedId == null) return false;
		const id = selectedId;
		if (e.key === 'Enter') {
			if ((e.target as HTMLElement).closest('button, a')) return false;
			e.preventDefault();
			row.querySelector<HTMLElement>('.title')?.click();
		} else if (key === 't') {
			e.preventDefault();
			const opened = row.nextElementSibling?.matches('form.editor') ?? false;
			if (!opened) row.querySelector<HTMLElement>('.title')?.click();
			void tick().then(() =>
				document.querySelector<HTMLInputElement>('form.editor input[name="tags"]')?.focus()
			);
		} else if (key === 'c') void postAction('complete', { id });
		else if (key === 'd') void postAction('duplicate', { id });
		else if (e.key === '*') {
			const starred = row.querySelector('.star.on') != null;
			void postAction('star', { id, starred: starred ? 0 : 1 });
		} else if (e.key === 'Delete') void postAction('trash', { id });
		else return false;
		e.preventDefault();
		return true;
	}

	// Arrastar um item da lista para a barra lateral: move de lista, atribui projeto, foca, conclui ou exclui.
	const DRAG_TYPE = 'application/x-gtdone-item';
	let dropOver: HTMLElement | null = null;
	const dropTarget = (e: DragEvent) => (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');

	function clearOver() {
		dropOver?.classList.remove('drop-over');
		dropOver = null;
	}

	function dragOver(e: DragEvent) {
		if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
		const el = dropTarget(e);
		if (!el) return clearOver();
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		if (el !== dropOver) {
			clearOver();
			dropOver = el;
			el.classList.add('drop-over');
		}
	}

	function dragLeave(e: DragEvent) {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) clearOver();
	}

	async function dropOnSidebar(e: DragEvent) {
		const id = Number(e.dataTransfer?.getData(DRAG_TYPE));
		const target = dropTarget(e)?.dataset.drop;
		clearOver();
		if (!id || !target) return;
		e.preventDefault();
		const [kind, arg] = target.split(':');
		let err: string | null = null;
		if (kind === 'state' && arg === 'scheduled') {
			const date = prompt(t('Data de início (AAAA-MM-DD):'));
			if (!date) return;
			err = await postAction('move', { id, state: 'scheduled', startsAt: date });
		} else if (kind === 'state') err = await postAction('move', { id, state: arg });
		else if (kind === 'project') err = await postAction('edit', { id, projectId: arg });
		else if (kind === 'focus') err = await postAction('star', { id, starred: 1 });
		else if (kind === 'completed') err = await postAction('complete', { id });
		else if (kind === 'trash') err = await postAction('trash', { id });
		if (err) alert(translateMessage(data.prefs.lang, err));
	}

	async function changeArea(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		await postAction('setArea', { area: value });
	}

	function search(e: SubmitEvent) {
		e.preventDefault();
		const q = new FormData(e.currentTarget as HTMLFormElement).get('q');
		void goto(`/search?q=${encodeURIComponent(String(q ?? ''))}`);
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
	<aside class:open={sidebarOpen}>
		<a class="brand" href="/inbox">GTDone</a>
		<nav aria-label={t('Listas')} ondragover={dragOver} ondragleave={dragLeave} ondrop={dropOnSidebar}>
			{#if data.prefs.focusPosition === 'top'}
				{@render focusLink()}
				<hr />
			{/if}
			{#each GROUP_A as list (list)}
				<a href={`/${list}${tagQuery}`} class:active={path === `/${list}`} data-drop={`state:${list}`}>
					<span class="icon">{LIST_META[list].icon}</span>
					<span class="label">{t(LIST_META[list].label)}</span>
					{#if badge(list)}<span class="count">{badge(list)}</span>{/if}
				</a>
			{/each}
			{#if data.prefs.focusPosition === 'bottom'}
				<hr />
				{@render focusLink()}
			{/if}
			<h4><a class="h4link" href="/projects">{t('Projetos')}</a></h4>
			{#each sidebarProjects as p (p.id)}
				<a href={`/projects/${p.id}`} class:active={path === `/projects/${p.id}`} data-drop={`project:${p.id}`}>
					<span class="icon">▸</span>
					<span class="label">{p.name}</span>
					{#if p.openCount}<span class="count">{p.openCount}</span>{/if}
				</a>
			{:else}
				<span class="hint">{t('Nenhum projeto ativo')}</span>
			{/each}
			<h4><a class="h4link" href="/goals">{t('Objetivos')}</a></h4>
			{#each data.goals as g (g.id)}
				<a href={`/goals/${g.id}`} class:active={path === `/goals/${g.id}`}>
					<span class="icon">🎯</span>
					<span class="label">{g.name}</span>
				</a>
			{:else}
				<span class="hint">{t('Nenhum objetivo ativo')}</span>
			{/each}
			{#if data.tags.length}
				<h4>{t('Tags')}</h4>
				<div class="tags">
					{#each data.tags as t (t.id)}
						<a
							class="tag"
							class:active={data.filter.tagId === t.id}
							href={tagHref(t.id)}>#{t.name}</a
						>
					{/each}
				</div>
			{/if}
			<div class="spacer"></div>
			<hr />
			{#if data.prefs.reference === 'show'}
				<a href="/reference" class:active={path === '/reference'}>
				<span class="icon">📎</span>
				<span class="label">{t('Referência')}</span>
			</a>
			{/if}
			<a href="/review" class:active={path === '/review'}>
				<span class="icon">🔁</span>
				<span class="label">{t('Revisão semanal')}</span>
			</a>
			<a href="/logbook" class:active={path === '/logbook'} data-drop="completed">
				<span class="icon">{LIST_META.logbook.icon}</span>
				<span class="label">{t(LIST_META.logbook.label)}</span>
			</a>
			<a href="/trash" class:active={path === '/trash'} data-drop="trash">
				<span class="icon">{LIST_META.trash.icon}</span>
				<span class="label">{t(LIST_META.trash.label)}</span>
			</a>
		</nav>
	</aside>

	<div class="main">
		<header>
			<button class="ghost burger" aria-label={t('Menu')} onclick={() => (sidebarOpen = !sidebarOpen)}>☰</button>
			<select aria-label={t('Área')} value={data.filter.area == null ? '' : String(data.filter.area)} onchange={changeArea}>
				<option value="">{t('Todas as áreas')}</option>
				{#each data.areas as a (a.id)}<option value={String(a.id)}>{a.name}</option>{/each}
				<option value="none">{t('Sem área')}</option>
			</select>
			<div class="menu-wrap">
				<button class="primary" onclick={() => (newMenu = !newMenu)}>＋ {t('Novo item')} ▾</button>
				{#if newMenu}
					<div class="menu" role="menu">
						<span class="menu-title">{t('Criar novo…')}</span>
						{#each MODES as m (m.key)}
							<button role="menuitem" onclick={() => { mode = m; newMenu = false; }}>
								<span>{t(m.label)}</span><kbd>{m.key.toUpperCase()}</kbd>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<form class="search" onsubmit={search}>
				<input bind:this={searchInput} name="q" type="search" placeholder={t('Buscar') + ' ( / )'} value={page.url.searchParams.get('q') ?? ''} />
			</form>
			<div class="menu-wrap">
				<button class="ghost" aria-label={t('Configurações')} onclick={() => (settingsMenu = !settingsMenu)}>⚙</button>
				{#if settingsMenu}
					<div class="menu" role="menu">
						<a href="/manage/areas">{t('Áreas')}</a>
						<a href="/manage/tags">{t('Tags')}</a>
						<a href="/manage/contacts">{t('Contatos')}</a>
						<a href="/settings">{t('Preferências')}</a>
						<form method="POST" action="/logout"><button role="menuitem">{t('Sair')}</button></form>
					</div>
				{/if}
			</div>
		</header>
		<main>
			{#if data.filter.tagId}
				<p class="filterbar">
					{t('Filtrando pela tag')} #{data.tags.find((t) => t.id === data.filter.tagId)?.name}
					<a href={path}>{t('limpar')}</a>
				</p>
			{/if}
			{@render children()}
		</main>
	</div>
</div>

{#snippet focusLink()}
	<a href={`/focus${tagQuery}`} class:active={path === '/focus'} data-drop="focus">
		<span class="icon">{LIST_META.focus.icon}</span>
		<span class="label">{t(LIST_META.focus.label)}</span>
		{#if data.counts.overdue}<span class="count late">{data.counts.overdue}</span>{/if}
		{#if data.counts.focus}<span class="count">{data.counts.focus}</span>{/if}
	</a>
{/snippet}

<Composer bind:mode />

{#if help}
	<div class="overlay" role="presentation" onclick={() => (help = false)}>
		<div class="help" role="dialog" aria-label={t('Atalhos de teclado')} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<h3>{t('Atalhos de teclado')}</h3>
			<table>
				<tbody>
					{#each SHORTCUTS as s (s.keys)}
						<tr><td><kbd>{s.keys}</kbd></td><td>{t(s.label)}</td></tr>
					{/each}
				</tbody>
			</table>
			<button class="ghost" onclick={() => (help = false)}>{t('Fechar')}</button>
		</div>
	</div>
{/if}

<style>
	:global(:root) {
		--bg: #15171c;
		--surface: #1d2027;
		--surface-2: #272b34;
		--border: #2f343e;
		--text: #e6e8ec;
		--muted: #8a919e;
		--accent-base: #4fb98a;
		--accent: var(--accent-pick, var(--accent-base));
		--danger: #ef6b6b;
		--row-pad: 0.6rem;
		--row-font: 1rem;
		--row-gap: 0.5rem;
	}
	:global(:root[data-theme='light']) {
		--bg: #f6f7f9;
		--surface: #ffffff;
		--surface-2: #eceef2;
		--border: #dde0e6;
		--text: #1c1f26;
		--muted: #6b7280;
		--accent-base: #1b7f5c;
		--danger: #c0392b;
	}
	@media (prefers-color-scheme: light) {
		:global(:root:not([data-theme='dark']):not([data-theme='light'])),
		:global(:root[data-theme='system']) {
			--bg: #f6f7f9;
			--surface: #ffffff;
			--surface-2: #eceef2;
			--border: #dde0e6;
			--text: #1c1f26;
			--muted: #6b7280;
			--accent-base: #1b7f5c;
			--danger: #c0392b;
		}
	}
	:global(:root[data-accent='blue']) { --accent-pick: #3b7de0; }
	:global(:root[data-accent='purple']) { --accent-pick: #8b5ce0; }
	:global(:root[data-accent='pink']) { --accent-pick: #d9548f; }
	:global(:root[data-accent='red']) { --accent-pick: #d94c47; }
	:global(:root[data-accent='orange']) { --accent-pick: #d97a22; }
	:global(:root[data-accent='yellow']) { --accent-pick: #b8991a; }
	:global(:root[data-accent='teal']) { --accent-pick: #2a9db0; }
	:global(:root[data-accent='gray']) { --accent-pick: #6f7785; }
	:global(:root[data-density='compact']) {
		--row-pad: 0.1rem;
		--row-font: 0.85rem;
		--row-gap: 0.3rem;
	}
	:global(.row.kbd-selected) {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.overlay {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.5);
		display: grid;
		place-items: center;
		z-index: 60;
	}
	.help {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.6rem;
		padding: 1rem 1.25rem;
		max-width: 38rem;
		max-height: 85vh;
		overflow: auto;
	}
	.help h3 {
		margin-top: 0;
	}
	.help td {
		padding: 0.25rem 0.75rem 0.25rem 0;
		vertical-align: top;
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	}
	:global(input, select, textarea) {
		background: var(--surface);
		color: inherit;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		padding: 0.45rem 0.6rem;
		font: inherit;
	}
	:global(button) {
		font: inherit;
	}
	:global(button.primary, form button[type='submit']) {
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 0.4rem;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
	}
	:global(button.ghost) {
		background: none;
		border: 1px solid var(--border);
		color: inherit;
		border-radius: 0.4rem;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}
	:global(a) {
		color: var(--accent);
	}
	.shell {
		display: flex;
		min-height: 100vh;
	}
	aside {
		width: 16rem;
		flex-shrink: 0;
		background: var(--surface);
		border-right: 1px solid var(--border);
		padding: 1rem 0.5rem;
		display: flex;
		flex-direction: column;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow-y: auto;
		box-sizing: border-box;
	}
	.brand {
		font-weight: 700;
		letter-spacing: 0.15em;
		text-decoration: none;
		color: var(--text);
		padding: 0 0.75rem 1rem;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1;
	}
	nav a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.75rem;
		border-radius: 0.4rem;
		color: var(--text);
		text-decoration: none;
	}
	nav a:hover {
		background: var(--surface-2);
	}
	nav :global(a.drop-over) {
		outline: 2px dashed var(--accent);
		background: color-mix(in srgb, var(--accent) 15%, transparent);
	}
	nav a.active {
		background: var(--surface-2);
		font-weight: 600;
	}
	.icon {
		width: 1.2rem;
		text-align: center;
	}
	.label {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.count.late {
		background: var(--danger);
		color: #fff;
		border-radius: 1rem;
		padding: 0 0.4rem;
	}
	h4 {
		margin: 1rem 0.75rem 0.25rem;
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
	}
	.hint {
		padding: 0.25rem 0.75rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		padding: 0 0.75rem;
	}
	nav .tag {
		padding: 0.1rem 0.5rem;
		border-radius: 1rem;
		background: var(--surface-2);
		font-size: 0.75rem;
	}
	nav .tag.active {
		background: var(--accent);
		color: #fff;
	}
	nav a.h4link {
		padding: 0;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
	}
	nav a.h4link:hover {
		background: none;
		color: var(--text);
	}
	hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0.5rem 0;
		width: 100%;
	}
	.spacer {
		flex: 1;
	}
	.main {
		flex: 1;
		min-width: 0;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		background: var(--bg);
		z-index: 10;
	}
	.search {
		margin-left: auto;
	}
	.burger {
		display: none;
	}
	main {
		max-width: 52rem;
		padding: 1.25rem;
		margin: 0 auto;
	}
	.filterbar {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.menu-wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 0.3rem);
		min-width: 15rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		display: flex;
		flex-direction: column;
		z-index: 30;
		box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
		padding: 0.25rem 0;
	}
	.menu-title {
		padding: 0.35rem 0.9rem;
		font-size: 0.75rem;
		color: var(--muted);
		font-style: italic;
	}
	.menu button,
	.menu a {
		display: flex;
		justify-content: space-between;
		background: none;
		border: none;
		color: var(--text);
		padding: 0.45rem 0.9rem;
		text-decoration: none;
		cursor: pointer;
		text-align: left;
		width: 100%;
		box-sizing: border-box;
	}
	.menu button:hover,
	.menu a:hover {
		background: var(--surface-2);
	}
	kbd {
		color: var(--muted);
		font-size: 0.75rem;
	}
	@media print {
		aside,
		header,
		:global(.bulkbar, .filters, .handle, .star, .menu-wrap, .composer, form.editor, .rapid) {
			display: none !important;
		}
		:global(body) {
			background: #fff;
			color: #000;
		}
		main {
			max-width: none;
			padding: 0;
		}
		:global(.row) {
			break-inside: avoid;
		}
	}
	@media (max-width: 800px) {
		aside {
			position: fixed;
			z-index: 40;
			transform: translateX(-100%);
			transition: transform 0.15s;
		}
		aside.open {
			transform: none;
		}
		.burger {
			display: inline-block;
		}
	}
</style>
