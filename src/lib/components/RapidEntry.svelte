<script lang="ts">
	import { postAction } from '#lib/client/actions.ts';
	import { toDateInput } from '#lib/gtd/core.ts';
	import { useT } from '#lib/prefs-context.ts';

	const t = useT();

	let {
		listState,
		starred = false,
		placeholder = 'Adicionar item… (Enter para criar)',
		projectId
	}: { listState: string; starred?: boolean; placeholder?: string; projectId?: number } = $props();

	let title = $state('');
	let startsAt = $state('');
	let error = $state('');
	let input: HTMLInputElement | undefined = $state();

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim()) return;
		const err = await postAction('capture', {
			title,
			quick: '1',
			state: listState,
			projectId,
			starred: starred ? '1' : '0',
			startsAt: listState === 'scheduled' ? startsAt : undefined
		});
		error = err ?? '';
		if (!err) {
			title = '';
			input?.focus();
		}
	}
</script>

<form class="rapid" onsubmit={submit}>
	<input
		bind:this={input}
		bind:value={title}
		placeholder={t(placeholder)}
		aria-label={t('Novo item')}
		onkeydown={(e) => e.key === 'Escape' && ((title = ''), input?.blur())}
	/>
	{#if listState === 'scheduled'}
		<input type="date" bind:value={startsAt} min={toDateInput(Date.now())} aria-label={t('Data de início')} required />
	{/if}
</form>
{#if error}<p class="error">{t.msg(error)}</p>{/if}

<style>
	.rapid {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 1.25rem;
	}
	.rapid input:first-child {
		flex: 1;
	}
	.error {
		color: var(--danger);
		font-size: 0.9rem;
	}
</style>
