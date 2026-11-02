<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { TIME_OPTIONS, ENERGY_LABEL } from '#lib/format.ts';
	import { useT } from '#lib/prefs-context.ts';

	type Named = { id: number; name: string };
	let { tags, contacts, projects }: { tags: Named[]; contacts: Named[]; projects: Named[] } =
		$props();

	const t = useT();
	const DUE_LABEL = { overdue: 'Atrasadas', week: 'Esta semana' } as const;
	const params = $derived(page.url.searchParams);

	function set(key: string, value: string) {
		const next = new URL(page.url.href);
		if (value) next.searchParams.set(key, value);
		else next.searchParams.delete(key);
		void goto(next, { replace: true });
	}

	function nameOf(list: Named[], id: string | null) {
		return list.find((x) => String(x.id) === id)?.name ?? '?';
	}

	const chips = $derived(
		[
			params.get('energy') && ['energy', `${t('Energia')}: ${t(ENERGY_LABEL[params.get('energy') as 'low'])}`],
			params.get('time') && ['time', t('Até {n} min', { n: params.get('time') ?? '' })],
			params.get('contact') && ['contact', `${t('Contato')}: ${nameOf(contacts, params.get('contact'))}`],
			params.get('project') && ['project', `${t('Projeto')}: ${nameOf(projects, params.get('project'))}`],
			params.get('tag') && ['tag', `#${nameOf(tags, params.get('tag'))}`],
			params.get('due') && ['due', t(DUE_LABEL[params.get('due') as 'week'])],
			params.get('sort') && ['sort', t('Ordem: prazo')]
		].filter(Boolean) as [string, string][]
	);

	function clearAll() {
		const next = new URL(page.url.href);
		for (const [k] of chips) next.searchParams.delete(k);
		void goto(next, { replace: true });
	}
</script>

<details class="filters" open={chips.length > 0}>
	<summary>{t('Filtros')}{chips.length ? ` (${chips.length})` : ''}</summary>
	<div class="row">
		<label>{t('Energia')}
			<select value={params.get('energy') ?? ''} onchange={(e) => set('energy', e.currentTarget.value)}>
				<option value="">{t('Qualquer')}</option>
				{#each Object.entries(ENERGY_LABEL) as [v, l] (v)}<option value={v}>{t(l)}</option>{/each}
			</select>
		</label>
		<label>{t('Tempo disponível')}
			<select value={params.get('time') ?? ''} onchange={(e) => set('time', e.currentTarget.value)}>
				<option value="">{t('Qualquer')}</option>
				{#each TIME_OPTIONS as o (o.value)}<option value={o.value}>{t('até {n}', { n: o.label })}</option>{/each}
			</select>
		</label>
		<label>{t('Contato')}
			<select value={params.get('contact') ?? ''} onchange={(e) => set('contact', e.currentTarget.value)}>
				<option value="">{t('Todos')}</option>
				{#each contacts as c (c.id)}<option value={String(c.id)}>{c.name}</option>{/each}
			</select>
		</label>
		<label>{t('Projeto')}
			<select value={params.get('project') ?? ''} onchange={(e) => set('project', e.currentTarget.value)}>
				<option value="">{t('Todos')}</option>
				{#each projects as p (p.id)}<option value={String(p.id)}>{p.name}</option>{/each}
			</select>
		</label>
		<label>{t('Tag')}
			<select value={params.get('tag') ?? ''} onchange={(e) => set('tag', e.currentTarget.value)}>
				<option value="">{t('Todas')}</option>
				{#each tags as tg (tg.id)}<option value={String(tg.id)}>#{tg.name}</option>{/each}
			</select>
		</label>
		<label>{t('Prazo')}
			<select value={params.get('due') ?? ''} onchange={(e) => set('due', e.currentTarget.value)}>
				<option value="">{t('Qualquer')}</option>
				<option value="overdue">{t('Atrasadas')}</option>
				<option value="week">{t('Esta semana')}</option>
			</select>
		</label>
		<label>{t('Ordenar')}
			<select value={params.get('sort') ?? ''} onchange={(e) => set('sort', e.currentTarget.value)}>
				<option value="">{t('Manual')}</option>
				<option value="due">{t('Por prazo')}</option>
			</select>
		</label>
	</div>
</details>
{#if chips.length}
	<div class="chips">
		{#each chips as [key, label] (key)}
			<button class="chip" onclick={() => set(key, '')} aria-label={t('Remover filtro {label}', { label })}>
				{label} ✕
			</button>
		{/each}
		<button class="ghost clear" onclick={clearAll}>{t('Limpar')}</button>
	</div>
{/if}

<style>
	.filters {
		margin: 0.5rem 0;
		font-size: 0.85rem;
	}
	summary {
		cursor: pointer;
		color: var(--muted);
	}
	.row {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-size: 0.75rem;
		color: var(--muted);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 0.75rem;
	}
	.chip {
		background: var(--accent);
		color: #fff;
		border: none;
		border-radius: 1rem;
		padding: 0.15rem 0.7rem;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.clear {
		font-size: 0.75rem;
		padding: 0.1rem 0.6rem;
	}
</style>
