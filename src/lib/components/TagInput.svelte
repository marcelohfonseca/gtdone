<script lang="ts">
	import { useT } from '#lib/prefs-context.ts';

	type Entry = { id: number; name: string; color?: string | null };
	type Kind = 'areas' | 'contacts' | 'tags';
	let {
		name = 'tags',
		value = $bindable(''),
		areas,
		contacts,
		tags,
		allowContacts = true,
		areasOnly = false,
		disabled = false,
		placeholder = ''
	}: {
		name?: string;
		value?: string;
		areas: Entry[];
		contacts: Entry[];
		tags: Entry[];
		allowContacts?: boolean;
		areasOnly?: boolean;
		disabled?: boolean;
		placeholder?: string;
	} = $props();

	const t = useT();
	const PREFIX: Record<Kind, string> = { areas: '!', contacts: '@', tags: '#' };
	const LABEL: Record<Kind, string> = { areas: 'Área', contacts: 'Pessoa', tags: 'Contexto' };
	const BY_PREFIX: Record<string, Kind> = { '!': 'areas', '@': 'contacts', '#': 'tags' };

	let focused = $state(false);
	let active = $state(-1);
	let input = $state<HTMLInputElement>();

	const split = $derived.by(() => {
		const i = value.lastIndexOf(',');
		return { head: value.slice(0, i + 1), token: value.slice(i + 1).trimStart() };
	});
	const parsed = $derived.by(() => {
		const prefix = /^[!@#]/.test(split.token) ? split.token[0] : '';
		return { prefix, query: split.token.slice(prefix ? 1 : 0).trim() };
	});
	const options = $derived.by(() => {
		const kinds: Kind[] = areasOnly
			? ['areas']
			: parsed.prefix
			? [BY_PREFIX[parsed.prefix]]
			: (['areas', 'contacts', 'tags'] as Kind[]);
		const pool: Record<Kind, Entry[]> = { areas, contacts: allowContacts ? contacts : [], tags };
		const q = parsed.query.toLowerCase();
		const list = kinds.flatMap((k) =>
			pool[k].filter((e) => e.name.toLowerCase().includes(q)).map((e) => ({ kind: k, name: e.name, create: false, color: e.color ?? null }))
		);
		const createKind: Kind = areasOnly ? 'areas' : parsed.prefix ? BY_PREFIX[parsed.prefix] : 'tags';
		const exact = list.some((o) => o.name.toLowerCase() === q);
		if (q && !exact && (createKind !== 'contacts' || allowContacts)) {
			list.push({ kind: createKind, name: parsed.query, create: true, color: null });
		}
		return list;
	});

	function pick(o: { kind: Kind; name: string }) {
		value = `${split.head}${split.head ? ' ' : ''}${PREFIX[o.kind]}${o.name}, `;
		active = -1;
		input?.focus();
	}

	function onkeydown(e: KeyboardEvent) {
		if (!focused || !options.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % options.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + options.length) % options.length;
		} else if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
			e.preventDefault();
			pick(options[active]);
		} else if (e.key === 'Escape') {
			focused = false;
		}
	}
</script>

<div class="taginput">
	<input
		bind:this={input}
		{name}
		bind:value
		{disabled}
		{placeholder}
		autocomplete="off"
		aria-label={t('Tags')}
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		oninput={() => (active = -1)}
		{onkeydown}
	/>
	{#if focused && options.length}
		<ul role="listbox">
			{#each options as o, i (o.kind + o.name + o.create)}
				<li role="option" aria-selected={i === active}>
					<button type="button" tabindex="-1" class:on={i === active} onmousedown={(e) => { e.preventDefault(); pick(o); }}>
						<span class="dot" style:background={o.color ?? 'var(--border)'}></span>
						<span class="n">{o.create ? t('Criar') + ' ' : ''}{PREFIX[o.kind]}{o.name}</span>
						<span class="kind">[{t(LABEL[o.kind])}]</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<small class="hint">{areasOnly ? t('! área') : t('@ pessoa · ! área · # contexto')}</small>
</div>

<style>
	.taginput {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	ul {
		position: absolute;
		top: 2.3rem;
		left: 0;
		right: 0;
		z-index: 40;
		list-style: none;
		margin: 0;
		padding: 0.25rem;
		max-height: 14rem;
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
	}
	button {
		all: unset;
		box-sizing: border-box;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem;
		border-radius: 0.3rem;
		cursor: pointer;
	}
	button:hover,
	button.on {
		background: var(--surface-2);
	}
	.dot {
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 50%;
		flex: none;
	}
	.n {
		flex: 1;
	}
	.kind {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.72rem;
	}
</style>
