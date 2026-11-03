<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { useT } from '#lib/prefs-context.ts';

	let { data, form }: PageProps = $props();
	const t = useT();
	const COLORS = ['#e5484d', '#f76b15', '#f5b700', '#30a46c', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f'];

	function pick(ev: Event, color: string) {
		const form = (ev.currentTarget as HTMLElement).closest('form')!;
		(form.elements.namedItem('color') as HTMLInputElement).value = color;
		form.requestSubmit();
	}
</script>

<svelte:head><title>{t(data.title)} · GTDone</title></svelte:head>

<h1>{t(data.title)}</h1>

<form method="POST" action="?/create" use:enhance class="add">
	<input name="name" required placeholder={t('Novo nome')} aria-label={t('Nome')} />
	<button type="submit">{t('Adicionar')}</button>
</form>
{#if form?.error}<p class="error">{t.msg(form.error)}</p>{/if}

<ul>
	{#each data.entries as e (e.id)}
		<li>
			<form method="POST" action="?/rename" use:enhance>
				<input type="hidden" name="id" value={e.id} />
				<input name="name" value={e.name} required aria-label={t('Nome')} />
				<button type="submit" class="ghost">{t('Renomear')}</button>
			</form>
			{#if data.kind === 'areas'}
				<form method="POST" action="?/color" use:enhance class="palette" aria-label={t('Cor de destaque')}>
					<input type="hidden" name="id" value={e.id} />
					<input type="hidden" name="color" value={e.color ?? ''} />
					<button type="button" class="dot none" class:on={!e.color} title={t('Sem cor')} aria-label={t('Sem cor')} onclick={(ev) => pick(ev, '')}></button>
					{#each COLORS as c (c)}
						<button type="button" class="dot" class:on={e.color === c} style:background={c} aria-label={c} onclick={(ev) => pick(ev, c)}></button>
					{/each}
					<label class="dot custom" class:on={!!e.color && !COLORS.includes(e.color)} style:background={e.color && !COLORS.includes(e.color) ? e.color : undefined} title={t('Cor personalizada')}>
						<input type="color" value={e.color ?? '#888888'} onchange={(ev) => pick(ev, ev.currentTarget.value)} />
					</label>
				</form>
			{/if}
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={e.id} />
				<button type="submit" class="ghost danger">{t('Excluir')}</button>
			</form>
		</li>
	{:else}
		<li class="muted">{t('Nenhum cadastro ainda.')}</li>
	{/each}
</ul>

<style>
	h1 {
		margin-top: 0;
	}
	.add,
	li,
	li form {
		display: flex;
		gap: 0.5rem;
	}
	li {
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--border);
	}
	ul {
		list-style: none;
		padding: 0;
	}
	.add {
		margin-bottom: 1rem;
	}
	.add input,
	li input[name='name'] {
		flex: 1;
	}
	.palette {
		align-items: center;
		gap: 0.3rem;
	}
	.dot {
		all: unset;
		box-sizing: border-box;
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid transparent;
		position: relative;
	}
	.dot:hover {
		transform: scale(1.15);
	}
	.dot.on {
		border-color: var(--text);
		box-shadow: 0 0 0 2px var(--bg);
	}
	.dot.none {
		background: linear-gradient(135deg, transparent 45%, var(--danger) 45% 55%, transparent 55%);
		border: 1px solid var(--border);
	}
	.dot.none.on {
		border: 2px solid var(--text);
	}
	.dot.custom {
		background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
		overflow: hidden;
	}
	.dot.custom input {
		opacity: 0;
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
	.error {
		color: var(--danger);
	}
	.muted {
		color: var(--muted);
	}
	:global(button.danger) {
		color: var(--danger);
	}
</style>
