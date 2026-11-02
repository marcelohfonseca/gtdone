<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';

	import type { Mode } from '#lib/modes.ts';
	import { useT } from '#lib/prefs-context.ts';

	const t = useT();

	let { mode = $bindable() }: { mode: Mode | null } = $props();

	let dialog: HTMLDialogElement | undefined = $state();
	let title = $state('');
	let extra = $state('');
	let error = $state('');

	$effect(() => {
		if (mode && dialog && !dialog.open) {
			title = '';
			extra = '';
			error = '';
			dialog.showModal();
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!mode) return;
		let err: string | null;
		if (mode.kind === 'project') {
			err = await postAction('createProject', { name: title, desiredOutcome: extra });
		} else if (mode.kind === 'tag') {
			err = await postAction('create', { name: title }, '/manage/tags');
		} else {
			err = await postAction('capture', {
				title,
				quick: '1',
				state: mode.state,
				starred: 'starred' in mode && mode.starred ? '1' : '0',
				startsAt: mode.state === 'scheduled' ? extra : undefined
			});
		}
		if (err) error = err;
		else dialog?.close();
	}
</script>

<dialog bind:this={dialog} onclose={() => (mode = null)}>
	{#if mode}
		<form onsubmit={submit}>
			<h2>{t(mode.label)}</h2>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:value={title}
				autofocus
				required
				placeholder={mode.kind === 'project' ? t('Nome do projeto') : mode.kind === 'tag' ? t('Nome da tag') : t('Título')}
			/>
			{#if mode.kind === 'project'}
				<input bind:value={extra} placeholder={t('Resultado desejado (opcional)')} />
			{:else if mode.state === 'scheduled'}
				<input type="date" bind:value={extra} required aria-label={t('Data de início')} />
			{/if}
			{#if error}<p class="error">{t.msg(error)}</p>{/if}
			<div class="actions">
				<button type="submit">{t('Criar')}</button>
				<button type="button" class="ghost" onclick={() => dialog?.close()}>{t('Cancelar')}</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	dialog {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 0.75rem;
		width: min(28rem, 92vw);
		padding: 1.25rem;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.55);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
	}
	.error {
		color: var(--danger);
		margin: 0;
	}
</style>
