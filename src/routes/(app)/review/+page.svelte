<script lang="ts">
	import ItemList from '#lib/components/ItemList.svelte';
	import type { PageProps } from './$types';
	import { useT } from '#lib/prefs-context.ts';

	let { data }: PageProps = $props();
	const t = useT();

	const COPY: Record<string, [string, string, string]> = {
		inbox: ['Caixa de entrada', 'Esclareça cada item: faça (se levar menos de 2 minutos), delegue, agende ou mova para a lista certa. Meta: caixa vazia.', 'Caixa vazia — ótimo!'],
		projects: ['Projetos', 'Todo projeto ativo precisa de uma próxima ação. Revise os destacados.', 'Nenhum projeto.'],
		next: ['Próximas', 'Ainda faz sentido? Conclua, exclua ou mova o que estiver velho.', 'Nenhuma próxima ação.'],
		waiting: ['Aguardando', 'Há algo para cobrar ou que já chegou?', 'Nada aguardando.'],
		scheduled: ['Agendadas', 'Confira datas de início e se algo precisa de preparação.', 'Nada agendado.'],
		someday: ['Algum dia', 'Algo merece sair daqui e virar ação? Algo pode ser descartado?', 'Nada guardado.']
	};
	const copy = $derived(COPY[data.name]);
	const last = $derived(data.step === data.total - 1);
</script>

<svelte:head><title>{t('Revisão semanal')} · GTDone</title></svelte:head>

<p class="step">{t('Revisão semanal · passo {n} de {total}', { n: data.step + 1, total: data.total })}</p>
<progress max={data.total} value={data.step + 1}></progress>
<h1>{t(copy[0])}</h1>
<p class="muted">{t(copy[1])}</p>

{#if data.name === 'projects'}
	<ul>
		{#each data.reviewProjects as p (p.id)}
			<li>
				<a href={`/projects/${p.id}`}>{p.name}</a>
				<span class="chip">{p.state}</span>
				{#if p.stalled}<span class="chip warn">{t('sem próxima ação')}</span>{/if}
			</li>
		{:else}
			<li class="muted">{t(copy[2])}</li>
		{/each}
	</ul>
{:else}
	<ItemList
		items={data.items}
		today={data.today}
		projects={data.projects}
		areas={data.areas}
		contacts={data.contacts}
		tags={data.tags}
		emptyText={t(copy[2])}
	/>
{/if}

<div class="nav">
	{#if data.step > 0}<a class="btn" href={`/review?step=${data.step - 1}`}>{t('← Anterior')}</a>{/if}
	{#if last}
		<a class="btn primary" href="/inbox">{t('Concluir revisão')}</a>
	{:else}
		<a class="btn primary" href={`/review?step=${data.step + 1}`}>{t('Próximo →')}</a>
	{/if}
</div>

<style>
	h1 {
		margin: 0.5rem 0 0;
	}
	.step,
	.muted {
		color: var(--muted);
		font-size: 0.9rem;
	}
	progress {
		width: 100%;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		display: flex;
		gap: 0.6rem;
		padding: 0.45rem 0;
		border-bottom: 1px solid var(--border);
	}
	.chip {
		font-size: 0.7rem;
		padding: 0.1rem 0.5rem;
		border-radius: 1rem;
		background: var(--surface-2);
		color: var(--muted);
	}
	.chip.warn {
		background: var(--danger);
		color: #fff;
	}
	.nav {
		display: flex;
		gap: 0.5rem;
		margin-top: 1.5rem;
	}
	.btn {
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		text-decoration: none;
		color: var(--text);
	}
	.btn.primary {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}
</style>
