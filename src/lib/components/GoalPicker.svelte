<script lang="ts">
	import { page } from '$app/state';
	import { postAction } from '#lib/client/actions.ts';
	import { useT } from '#lib/prefs-context.ts';

	let { kind, id, disabled = false }: { kind: 'item' | 'project'; id: number; disabled?: boolean } = $props();
	const t = useT();
	let error = $state('');

	const goals = $derived((page.data.goals ?? []) as { id: number; name: string }[]);
	const current = $derived(
		((page.data.goalLinks?.[kind === 'item' ? 'items' : 'projects']?.[id] ?? []) as number[])[0]
	);

	async function change(value: string) {
		error = (await postAction('setGoals', { kind, targetId: id, goalIds: value })) ?? '';
	}
</script>

<label>
	{t('Objetivo')}
	<select {disabled} onchange={(e) => change(e.currentTarget.value)}>
		<option value="">{t('Nenhum')}</option>
		{#each goals as g (g.id)}
			<option value={String(g.id)} selected={current === g.id}>{g.name}</option>
		{/each}
	</select>
	{#if error}<span class="error">{t.msg(error)}</span>{/if}
</label>

<style>
	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
		color: var(--muted);
	}
	.error {
		color: var(--danger);
	}
</style>
