<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import type { Item } from '#lib/gtd/items.ts';
	import { LIST_META, STATE_LISTS } from '#lib/gtd/core.ts';
	import { scheduleBucket } from '#lib/calendar.ts';
	import ItemRow from './ItemRow.svelte';
	import { ENERGY_LABEL, TIME_OPTIONS, copyText, itemsAsText, minutesLabel } from '#lib/format.ts';
	import { usePrefs, useT } from '#lib/prefs-context.ts';

	type Named = { id: number; name: string; color?: string | null };
	let {
		items,
		today,
		projects,
		areas,
		contacts,
		tags,
		groupBy = 'none',
		limitPerGroup = 0,
		emptyText
	}: {
		items: Item[];
		today: number;
		projects: Named[];
		areas: Named[];
		contacts: Named[];
		tags: Named[];
		groupBy?: 'none' | 'project' | 'contact' | 'focus' | 'state' | 'schedule' | 'context' | 'time' | 'energy';
		// Em grupos de projeto, estado, contexto, tempo ou energia, limita cada grupo até o usuário expandir (0 = sem limite).
		limitPerGroup?: number;
		emptyText: string;
	} = $props();

	type Group = { key: string; title: string | null; href: string | null; items: Item[] };

	const groups = $derived.by<Group[]>(() => {
		if (groupBy === 'none') return [{ key: 'all', title: null, href: null, items }];
		if (groupBy === 'state') {
			const order = ['next', 'waiting', 'later', 'scheduled', 'someday', 'inbox', 'completed'];
			return order
				.map((st) => ({
					key: st,
					title: st === 'completed' ? t('Concluídas') : st === 'next' ? t('Próximas ações') : t(LIST_META[st as 'inbox'].label),
					href: null,
					items: items.filter((i) => i.state === st)
				}))
				.filter((g) => g.items.length > 0);
		}
		if (groupBy === 'schedule') {
			const weekStart = prefs().weekStart === 'sunday' ? 0 : 1;
			const parts: [string, string][] = [
				['thisWeek', t('Esta semana')],
				['nextWeek', t('Próxima semana')],
				['future', t('Datas futuras')]
			];
			return parts
				.map(([key, title]) => ({
					key,
					title,
					href: null,
					items: items.filter((i) => scheduleBucket(i.startsAt ?? today, today, weekStart) === key)
				}))
				.filter((g) => g.items.length > 0);
		}
		if (groupBy === 'focus') {
			const parts: [string, string, (i: Item) => boolean][] = [
				['auto', t('Vencidas e para hoje'), (i) => !i.starred],
				['manual', t('Em foco'), (i) => i.starred && i.state !== 'someday'],
				['someday', t('Algum dia — vale revisar'), (i) => i.starred && i.state === 'someday']
			];
			return parts
				.map(([key, title, test]) => ({ key, title, href: null, items: items.filter(test) }))
				.filter((g) => g.items.length > 0);
		}
		if (groupBy === 'context' || groupBy === 'time' || groupBy === 'energy') {
			const map = new Map<string, Group>();
			for (const it of items) {
				let values: { key: string; title: string }[];
				if (groupBy === 'context') {
					values = it.tags.length
						? it.tags.map((tag) => ({ key: `context:${tag}`, title: tag }))
						: [{ key: 'none', title: t('Sem contexto') }];
				} else if (groupBy === 'time') {
					values = it.minutes == null
						? [{ key: 'none', title: t('Sem estimativa') }]
						: [{ key: `time:${it.minutes}`, title: minutesLabel(it.minutes, prefs().lang) }];
				} else {
					values = it.energy == null
						? [{ key: 'none', title: t('Sem energia') }]
						: [{ key: `energy:${it.energy}`, title: t(ENERGY_LABEL[it.energy]) }];
				}
				for (const { key, title } of values) {
					if (!map.has(key)) map.set(key, { key, title, href: null, items: [] });
					map.get(key)!.items.push(it);
				}
			}
			return [...map.values()].sort((a, b) => {
				if (a.key === 'none') return -1;
				if (b.key === 'none') return 1;
				if (groupBy === 'time') return Number(a.key.slice(5)) - Number(b.key.slice(5));
				if (groupBy === 'energy') {
					const order = ['low', 'medium', 'high'];
					return order.indexOf(a.key.slice(7)) - order.indexOf(b.key.slice(7));
				}
				return a.title!.localeCompare(b.title!);
			});
		}
		const map = new Map<string, Group>();
		for (const it of items) {
			const byProject = groupBy === 'project';
			const key = byProject ? `p${it.projectId ?? 0}` : `c${it.contactId ?? 0}`;
			const title = byProject ? it.projectName : it.contactName;
			if (!map.has(key)) {
				map.set(key, {
					key,
					title: title ?? (byProject ? t('Sem projeto') : t('Sem responsável')),
					href: byProject && it.projectId ? `/projects/${it.projectId}` : null,
					items: []
				});
			}
			map.get(key)!.items.push(it);
		}
		return [...map.values()].sort((a, b) => Number(b.key === 'p0') - Number(a.key === 'p0'));
	});

	const prefs = usePrefs();
	const t = useT();
	let copied = $state('');
	let error = $state('');
	let selecting = $state(false);
	let selected = $state<number[]>([]);
	let op = $state('complete');
	let arg = $state('next');
	let dragId: number | null = null;
	let expanded = $state<string[]>([]);
	const limitedGrouping = $derived(
		limitPerGroup > 0 && ['project', 'state', 'context', 'time', 'energy'].includes(groupBy)
	);

	function visible(group: Group): Item[] {
		return limitedGrouping && !expanded.includes(group.key) ? group.items.slice(0, limitPerGroup) : group.items;
	}

	async function reorder(group: Group, ids: number[]) {
		error = (await postAction('reorder', { ids: ids.join(',') })) ?? '';
		void group;
	}

	async function copy() {
		const chosen = selecting && selected.length ? items.filter((i) => selected.includes(i.id)) : items;
		const ok = await copyText(itemsAsText(chosen, prefs().dateFormat));
		copied = ok ? t('{n} item(ns) copiado(s)', { n: chosen.length }) : t('não foi possível copiar');
		setTimeout(() => (copied = ''), 3000);
	}

	function toggle(id: number) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
	}

	async function applyBulk() {
		const err = await postAction('bulk', { ids: selected.join(','), op, arg });
		error = err ?? '';
		if (!err) {
			selected = [];
			selecting = false;
		}
	}

	function onDrop(group: Group, targetId: number) {
		if (dragId == null || dragId === targetId) return;
		const ids = group.items.map((i) => i.id);
		const from = ids.indexOf(dragId);
		const to = ids.indexOf(targetId);
		dragId = null;
		if (from < 0 || to < 0) return;
		ids.splice(to, 0, ids.splice(from, 1)[0]);
		void reorder(group, ids);
	}

	function step(group: Group, id: number, dir: -1 | 1) {
		const ids = group.items.map((i) => i.id);
		const i = ids.indexOf(id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= ids.length) return;
		[ids[i], ids[j]] = [ids[j], ids[i]];
		void reorder(group, ids);
	}
</script>

{#if error}<p class="error">{t.msg(error)}</p>{/if}
{#if items.length > 0}
	<div class="bulkbar">
		<button class="ghost" onclick={copy}>{t('Copiar')}</button>
		<button class="ghost" onclick={() => window.print()}>{t('Imprimir')}</button>
		{#if copied}<span class="muted" role="status">{copied}</span>{/if}
		<button class="ghost" onclick={() => ((selecting = !selecting), (selected = []))}>
			{selecting ? t('Cancelar seleção') : t('Selecionar')}
		</button>
		{#if selecting}
			<button class="ghost" onclick={() => (selected = items.map((i) => i.id))}>{t('Todos')}</button>
			<span class="muted">{t('{n} selecionado(s)', { n: selected.length })}</span>
			<select bind:value={op} onchange={() => (arg = op === 'move' ? 'next' : '')} aria-label={t('Operação em lote')}>
				<option value="complete">{t('Concluir')}</option>
				<option value="move">{t('Mover para…')}</option>
				<option value="tag">{t('Adicionar tag…')}</option>
				<option value="star">{t('Adicionar ao Foco')}</option>
				<option value="unstar">{t('Remover do Foco')}</option>
				<option value="trash">{t('Excluir')}</option>
				<option value="restore">{t('Restaurar')}</option>
				<option value="due">{t('Definir prazo…')}</option>
				<option value="start">{t('Definir data de início…')}</option>
				<option value="energy">{t('Definir energia…')}</option>
				<option value="minutes">{t('Definir tempo…')}</option>
			</select>
			{#if op === 'move'}
				<select bind:value={arg} aria-label={t('Lista de destino')}>
					{#each STATE_LISTS.filter((s) => s !== 'scheduled') as s (s)}
						<option value={s}>{t(LIST_META[s].label)}</option>
					{/each}
				</select>
			{:else if op === 'due' || op === 'start'}
				<input type="date" bind:value={arg} aria-label={t('Data')} />
				<span class="muted">{t('(vazio remove a data)')}</span>
			{:else if op === 'energy'}
				<select bind:value={arg} aria-label={t('Energia')}>
					<option value="">{t('Sem energia')}</option>
					<option value="low">{t('Baixa')}</option>
					<option value="medium">{t('Média')}</option>
					<option value="high">{t('Alta')}</option>
				</select>
			{:else if op === 'minutes'}
				<select bind:value={arg} aria-label={t('Tempo')}>
					<option value="">{t('Sem estimativa')}</option>
					{#each TIME_OPTIONS as o (o.value)}<option value={String(o.value)}>{t(o.label)}</option>{/each}
				</select>
			{:else if op === 'tag'}
				<input bind:value={arg} placeholder={t('tag')} aria-label={t('Tag')} />
			{/if}
			<button disabled={selected.length === 0} onclick={applyBulk}>{t('Aplicar')}</button>
		{/if}
	</div>
{/if}
{#if items.length === 0}
	<p class="empty">{t(emptyText)}</p>
{/if}
{#each groups as group (group.key)}
	{#if group.title}
		<h3 class="group">
			{#if group.href}<a href={group.href}>{group.title}</a>{:else}{group.title}{/if}
		</h3>
	{/if}
	<div class="list">
		{#each visible(group) as item (item.id)}
			<div
				class="sel"
				role="listitem"
				draggable="true"
				ondragstart={(e) => {
					dragId = item.id;
					e.dataTransfer?.setData('application/x-gtdone-item', String(item.id));
					if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
				}}
				ondragend={() => (dragId = null)}
				ondragover={(e) => e.preventDefault()}
				ondrop={() => onDrop(group, item.id)}
			>
				{#if selecting}
					<input
						type="checkbox"
						checked={selected.includes(item.id)}
						onchange={() => toggle(item.id)}
						aria-label={t('Selecionar item')}
					/>
				{/if}
				<div class="rowbox">
				<ItemRow
					{item}
					{today}
					{projects}
					{areas}
					{contacts}
					{tags}
					showProject={groupBy !== 'project'}
					onmove={(id, dir) => step(group, id, dir)}
				/>
				</div>
			</div>
		{/each}
		{#if limitedGrouping && group.items.length > visible(group).length}
			<button class="ghost more" onclick={() => (expanded = [...expanded, group.key])}>
				{t('Mostrar mais {n} ação(ões)', { n: group.items.length - visible(group).length })}
			</button>
		{:else if limitedGrouping && expanded.includes(group.key) && group.items.length > limitPerGroup}
			<button class="ghost more" onclick={() => (expanded = expanded.filter((k) => k !== group.key))}>
				{t('Mostrar menos')}
			</button>
		{/if}
	</div>
{/each}

<style>
	.more {
		margin: 0.25rem 0 0 1.5rem;
		font-size: 0.8rem;
	}
	.bulkbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
	}
	.muted {
		color: var(--muted);
	}
	.sel {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
	}
	.rowbox {
		flex: 1;
		min-width: 0;
	}
	.group {
		margin: 1.25rem 0 0.25rem;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--muted);
	}
	.group a {
		color: inherit;
		text-decoration: none;
	}
	.empty {
		color: var(--muted);
		padding: 2rem 0;
		text-align: center;
	}
	.error {
		color: var(--danger);
	}
</style>
