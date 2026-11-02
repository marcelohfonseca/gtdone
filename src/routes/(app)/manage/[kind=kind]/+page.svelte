<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import { useT } from '#lib/prefs-context.ts';

	let { data, form }: PageProps = $props();
	const t = useT();
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
