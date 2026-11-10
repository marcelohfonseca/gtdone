<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import { useT } from '#lib/prefs-context.ts';

	type Entry = { id: number; name: string; color?: string | null };
	type Kind = 'areas' | 'contacts' | 'tags';
	let {
		areas,
		contacts,
		tags,
		initial = 'areas',
		onclose
	}: { areas: Entry[]; contacts: Entry[]; tags: Entry[]; initial?: Kind; onclose?: () => void } = $props();

	const t = useT();
	const TABS: [Kind, string][] = [
		['areas', 'Áreas'],
		['contacts', 'Contatos'],
		['tags', 'Contextos']
	];
	const COLORS: [string, string][] = [
		['#e5484d', 'vermelho'],
		['#f76b15', 'laranja'],
		['#f5b700', 'amarelo'],
		['#30a46c', 'verde'],
		['#3e63dd', 'azul'],
		['#8e4ec6', 'roxo']
	];
	const ADD: Record<Kind, string> = { areas: 'Nova área…', contacts: 'Novo contato…', tags: 'Nova tag' };

	// svelte-ignore state_referenced_locally
	let tab = $state<Kind>(initial);
	let openId = $state<number | null>(null);
	let error = $state('');
	const entries = $derived({ areas, contacts, tags }[tab]);

	async function run(name: string, data: Record<string, string | number>) {
		error = (await postAction(name, data, `/manage/${tab}`)) ?? '';
		openId = null;
	}
	function add() {
		const name = prompt(t('Nome:'))?.trim();
		if (name) void run('create', { name });
	}
	function rename(e: Entry) {
		const name = prompt(t('Nome:'), e.name)?.trim();
		if (name && name !== e.name) void run('rename', { id: e.id, name });
	}
	function remove(e: Entry) {
		if (confirm(t('Excluir este cadastro? Os itens vinculados não são apagados.'))) void run('delete', { id: e.id });
	}
	function convert(e: Entry) {
		void run('convert', { id: e.id });
	}
	function color(e: Entry, value: string) {
		void run('color', { id: e.id, color: value });
	}
	const isCustom = (e: Entry) => !!e.color && !COLORS.some(([c]) => c === e.color);
</script>

<svelte:window onclick={(ev) => { if (openId !== null && !(ev.target as HTMLElement).closest('.row-menu')) openId = null; }} />

<div class="tabs" role="tablist">
	{#each TABS as [k, label] (k)}
		<button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => { tab = k; openId = null; }}>{t(label)}</button>
	{/each}
</div>

<button class="add" onclick={add}>⊕ {t(ADD[tab])}</button>
<p class="tip">{t('Dica: nos campos de tags, digite @ para pessoas, ! para áreas e # para contextos. Nomes novos são criados automaticamente.')}</p>
{#if error}<p class="error">{t.msg(error)}</p>{/if}

<ul>
	{#each entries as e (e.id)}
		<li>
			<span class="icon" style:color={e.color ?? undefined} class:square={tab === 'areas'} style:background={tab === 'areas' ? (e.color ?? 'var(--border)') : undefined}>
				{#if tab === 'contacts'}👤{:else if tab === 'tags'}🏷{/if}
			</span>
			<span class="name">{e.name}</span>
			<div class="row-menu">
				<button class="ghost caret" aria-label={t('Opções')} aria-expanded={openId === e.id} onclick={() => (openId = openId === e.id ? null : e.id)}>▾</button>
				{#if openId === e.id}
					<div class="menu" role="menu">
						<span class="cap">{e.name}</span>
						<button role="menuitem" onclick={() => rename(e)}>{t('Renomear…')}</button>
						<button role="menuitem" class="danger" onclick={() => remove(e)}>{t('Excluir…')}</button>
						{#if tab !== 'areas'}
							<span class="cap">{t('Tipo')}</span>
							<button role="menuitem" onclick={() => tab === 'tags' && convert(e)}><span class="check">{tab === 'contacts' ? '✓' : ''}</span>{t('Pessoa')}</button>
							<button role="menuitem" onclick={() => tab === 'contacts' && convert(e)}><span class="check">{tab === 'tags' ? '✓' : ''}</span>{t('Contexto')}</button>
						{/if}
						<span class="cap">{t('Cor')}</span>
						<button role="menuitem" onclick={() => color(e, '')}><span class="check">{!e.color ? '✓' : ''}</span>{t('nenhuma')}</button>
						{#each COLORS as [c, label] (c)}
							<button role="menuitem" onclick={() => color(e, c)}>
								<span class="check">{e.color === c ? '✓' : ''}</span><i style:background={c}></i>{t(label)}
							</button>
						{/each}
						<label class="custom">
							<span class="check">{isCustom(e) ? '✓' : ''}</span><i class="wheel" style:background={isCustom(e) ? e.color : undefined}></i>{t('Cor personalizada')}
							<input type="color" value={e.color ?? '#888888'} onchange={(ev) => color(e, ev.currentTarget.value)} />
						</label>
					</div>
				{/if}
			</div>
		</li>
	{:else}
		<li class="muted">{t('Nenhum cadastro ainda.')}</li>
	{/each}
</ul>
{#if onclose}<div class="foot"><button onclick={onclose}>{t('Concluído')}</button></div>{/if}

<style>
	.tabs {
		display: flex;
		gap: 1.25rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 1rem;
	}
	.tabs button {
		all: unset;
		cursor: pointer;
		padding: 0.5rem 0.1rem;
		color: var(--muted);
		border-bottom: 2px solid transparent;
	}
	.tabs button.on {
		color: var(--text);
		border-bottom-color: var(--text);
	}
	.add {
		margin-bottom: 0.5rem;
	}
	.tip {
		margin: 0 0 0.75rem;
		font-size: 0.78rem;
		color: var(--muted);
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.45rem 0.25rem;
	}
	.icon {
		width: 1.1rem;
		text-align: center;
		font-size: 0.95rem;
		flex: none;
	}
	.icon.square {
		height: 1.1rem;
		border-radius: 3px;
	}
	.name {
		flex: 1;
	}
	.row-menu {
		position: relative;
	}
	.caret {
		padding: 0 0.4rem;
		font-size: 0.8rem;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 100%;
		z-index: 30;
		min-width: 12rem;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0.5rem;
		padding: 0.3rem;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
	}
	.menu button,
	.custom {
		all: unset;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.6rem;
		border-radius: 0.3rem;
		cursor: pointer;
		position: relative;
	}
	.menu button:hover,
	.custom:hover {
		background: var(--surface-2);
	}
	.cap {
		font-size: 0.8rem;
		color: var(--muted);
		padding: 0.35rem 0.6rem 0.15rem;
	}
	.check {
		width: 0.9rem;
		font-size: 0.8rem;
	}
	.menu i {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 3px;
	}
	.menu i.wheel {
		border-radius: 50%;
		background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
	}
	.custom input {
		opacity: 0;
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
	.danger {
		color: var(--danger);
	}
	.error {
		color: var(--danger);
	}
	.muted {
		color: var(--muted);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: 1rem;
	}
</style>
