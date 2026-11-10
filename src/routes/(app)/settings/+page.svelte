<script lang="ts">
	import { enhance } from '$app/forms';
	import { usePrefs, useT } from '#lib/prefs-context.ts';
	import { ACCENTS, type PrefKey } from '#lib/gtd/preferences.ts';
	import { SHORTCUTS } from '#lib/shortcuts.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const prefs = usePrefs();
	const t = useT();

	type Field = { key: PrefKey; label: string; hint?: string; options: [string, string][] };

	function applyNow(el: HTMLInputElement | HTMLSelectElement) {
		const root = document.documentElement;
		if (el.name === 'density') root.dataset.density = el.value;
		else if (el.name === 'contentAlignment') root.dataset.contentAlignment = el.value;
		else if (el.name === 'accent') root.dataset.accent = el.value;
		else if (el.name === 'theme') root.dataset.theme = el.value;
		else if (el.name === 'lang') root.lang = el.value;
	}

	const ACCENT_LABEL: Record<string, string> = {
		green: 'Verde',
		blue: 'Azul',
		purple: 'Roxo',
		pink: 'Rosa',
		red: 'Vermelho',
		orange: 'Laranja',
		yellow: 'Amarelo',
		teal: 'Turquesa',
		gray: 'Cinza'
	};

	const TABS: { id: string; label: string; fields: Field[] }[] = [
		{
			id: 'appearance',
			label: 'Aparência',
			fields: [
				{ key: 'theme', label: 'Tema', options: [['system', 'Seguir o sistema'], ['light', 'Claro'], ['dark', 'Escuro']] },
				{ key: 'density', label: 'Densidade', options: [['normal', 'Normal'], ['compact', 'Compacta']] },
				{ key: 'contentAlignment', label: 'Alinhamento do conteúdo', options: [['center', 'Centralizado'], ['left', 'Alinhado à esquerda']] }
			]
		},
		{
			id: 'region',
			label: 'Idioma e região',
			fields: [
				{ key: 'lang', label: 'Idioma', options: [['pt-BR', 'Português (Brasil)'], ['en-US', 'English (US)']] },
				{ key: 'dateFormat', label: 'Formato de data', options: [['dmy', '02/11/2026 (dia/mês/ano)'], ['mdy', '11/02/2026 (mês/dia/ano)'], ['ymd', '2026-11-02 (ISO)']] },
				{ key: 'weekStart', label: 'Semana começa em', hint: 'Define o fim de "Esta semana" nos filtros de prazo.', options: [['monday', 'Segunda-feira'], ['sunday', 'Domingo']] },
				{ key: 'dueDisplay', label: 'Prazos', options: [['relative', 'Relativo (Hoje, Amanhã)'], ['absolute', 'Data absoluta']] }
			]
		},
		{
			id: 'workflow',
			label: 'Fluxo de trabalho',
			fields: [
				{ key: 'rapidEntry', label: 'Entrada rápida', options: [['show', 'Mostrar'], ['hide', 'Ocultar']] },
				{ key: 'completedPosition', label: 'Itens concluídos em projetos', options: [['bottom', 'Mover para o fim da lista'], ['inplace', 'Manter na posição']] }
			]
		},
		{
			id: 'sidebar',
			label: 'Barra lateral',
			fields: [
				{ key: 'counts', label: 'Contadores', hint: 'Padrão mostra Entrada, Aguardando, Foco e itens vencidos em Projetos.', options: [['attention', 'Padrão'], ['all', 'Mostrar todos']] },
				{ key: 'focusPosition', label: 'Posição do Foco', options: [['top', 'Topo'], ['bottom', 'Abaixo das listas']] },
				{ key: 'reference', label: 'Referência', options: [['show', 'Mostrar'], ['hide', 'Ocultar']] },
				{ key: 'later', label: 'Depois', options: [['on', 'Ativar'], ['off', 'Desativar']] },
				{ key: 'waiting', label: 'Aguardando', options: [['on', 'Ativar'], ['off', 'Desativar']] },
				{ key: 'calendar', label: 'Calendário', options: [['on', 'Ativar'], ['off', 'Desativar']] },
				{ key: 'kanban', label: 'Kanban', hint: 'Desativar só oculta o menu; os quadros criados são mantidos.', options: [['on', 'Ativar'], ['off', 'Desativar']] },
				{ key: 'sequentialSidebar', label: 'Projetos sequenciais na barra', options: [['on', 'Mostrar'], ['off', 'Ocultar']] }
			]
		},
		{
			id: 'advanced',
			label: 'Avançado',
			fields: [
				{ key: 'inboxArea', label: 'Entrada e áreas', hint: 'Ao mover da Entrada com uma área filtrada.', options: [['keep', 'Mover sem atribuir área'], ['assign', 'Atribuir à área atual']] },
				{ key: 'unassignedUnderFilter', label: 'Filtro global de área', options: [['hidden', 'Ocultar itens sem área'], ['visible', 'Manter itens sem área visíveis']] }
			]
		},
		{ id: 'shortcuts', label: 'Atalhos', fields: [] },
		{ id: 'data', label: 'Dados e integrações', fields: [] }
	];

	let tab = $state('appearance');
	let formEl: HTMLFormElement | undefined = $state();
	const current = $derived(TABS.find((x) => x.id === tab)!);
</script>

<svelte:head><title>{t('Preferências')} · GTDone</title></svelte:head>

<h1>{t('Preferências')}</h1>

<div class="layout">
	<nav aria-label={t('Seções')}>
		{#each TABS as tb (tb.id)}
			<button class:active={tab === tb.id} onclick={() => (tab = tb.id)}>{t(tb.label)}</button>
		{/each}
	</nav>

	{#if tab === 'data'}
		<div class="data">
			<section>
				<h3>{t('Exportar e importar')}</h3>
				<p><a class="btn" href="/settings/export" download>{t('Baixar exportação (JSON)')}</a></p>
				<small>Inclui itens, projetos, áreas, tags, contatos, checklists, recorrências, notas e histórico. Não inclui conta, sessões nem segredos de integração.</small>
				<form method="POST" enctype="multipart/form-data" use:enhance={() => ({ update }) => update({ reset: false })}>
					<label class="field">
						<span>{t('Arquivo de exportação')}</span>
						<input type="file" name="file" accept="application/json,.json" required />
					</label>
					<label class="check"><input type="checkbox" name="confirm" value="yes" /> {t('Entendo que isto substitui todos os dados atuais (um backup é criado antes)')}</label>
					<div class="row">
						<button type="submit" class="ghost" formaction="?/validateImport">{t('Só validar')}</button>
						<button type="submit" formaction="?/importData">{t('Importar')}</button>
					</div>
					{#if form?.section === 'import'}
						{#if form.error}<p class="error">{t.msg(form.error)}</p>{:else if form.message}<p class="ok">{form.message}</p>{/if}
					{/if}
				</form>
				<small>Arquivos grandes exigem aumentar <code>BODY_SIZE_LIMIT</code> do servidor Node.</small>
			</section>

			<section>
				<h3>{t('Captura por email')}</h3>
				<small>Um serviço de recebimento de email (Postmark, Cloudflare Email Worker, n8n…) deve enviar um POST JSON <code>{'{from, subject, text}'}</code> para <code>/api/inbound-email</code> com o cabeçalho <code>Authorization: Bearer &lt;token&gt;</code>. Assunto vira título, corpo vira notas, em Entrada.</small>
				<form method="POST" action="?/genToken" use:enhance={() => ({ update }) => update({ reset: false })}>
					<div class="row">
						<span>{data.inbound.hasToken ? t('Token ativo.') : t('Nenhum token ativo.')}</span>
						<button type="submit" class="ghost" onclick={(e) => { if (data.inbound.hasToken && !confirm('Gerar um novo token invalida o anterior. Continuar?')) e.preventDefault(); }}>{data.inbound.hasToken ? t('Gerar novo token') : t('Gerar token')}</button>
						{#if data.inbound.hasToken}<button type="submit" class="ghost" formaction="?/revokeToken">{t('Revogar')}</button>{/if}
					</div>
				</form>
				{#if form?.section === 'email' && form.token}
					<p class="ok">{t('Copie agora; ele não será exibido de novo:')}</p>
					<code class="token">{form.token}</code>
				{/if}
				<form method="POST" action="?/saveSenders" use:enhance={() => ({ update }) => update({ reset: false })}>
					<label class="field">
						<span>{t('Remetentes autorizados (separados por vírgula)')}</span>
						<input name="senders" value={data.inbound.senders.join(', ')} placeholder="voce@exemplo.com" />
						<small>Sem remetentes cadastrados, nada é aceito. O token é a proteção principal: o campo “From” de um email pode ser forjado.</small>
					</label>
					<button type="submit">{t('Salvar remetentes')}</button>
				</form>
				{#if form?.section === 'email' && form.error}<p class="error">{t.msg(form.error)}</p>{/if}
			</section>

			<section>
				<h3>{t('Email periódico do Foco')}</h3>
				{#if !data.digest.smtp}
					<p class="error">SMTP não configurado. Defina <code>GTDONE_SMTP_URL</code> e <code>GTDONE_MAIL_FROM</code> no ambiente do servidor.</p>
				{/if}
				<form method="POST" action="?/saveDigest" use:enhance={() => ({ update }) => update({ reset: false })}>
					<label class="check"><input type="checkbox" name="enabled" checked={data.digest.config.enabled} /> {t('Enviar o Foco por email')}</label>
					<fieldset class="days">
						<legend>{t('Dias')}</legend>
						{#each ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as d, i (i)}
							<label class="check"><input type="checkbox" name="days" value={i} checked={data.digest.config.days.includes(i)} /> {t(d)}</label>
						{/each}
					</fieldset>
					<label class="field"><span>{t('Horário (do servidor)')}</span><input type="time" name="time" value={data.digest.config.time} required /></label>
					<label class="field"><span>{t('Destinatário')}</span><input type="email" name="to" value={data.digest.config.to} /></label>
					<div class="row">
						<button type="submit">{t('Salvar')}</button>
						<button type="submit" class="ghost" formaction="?/sendDigest" disabled={!data.digest.smtp}>{t('Enviar teste agora')}</button>
					</div>
				</form>
				{#if form?.section === 'digest'}
					{#if form.error}<p class="error">{t.msg(form.error)}</p>{:else if form.message}<p class="ok">{form.message}</p>{:else if form.ok}<p class="ok">{t('Salvo.')}</p>{/if}
				{/if}
				<small>
					{t('Último envio')}: {data.digest.status.lastSent ?? t('nunca')}.
					Falhas são tentadas até 3 vezes por dia, a cada 15 minutos.
				</small>
				{#if data.digest.status.error}<p class="error">Última falha ({data.digest.status.attempts}ª tentativa): {data.digest.status.error}</p>{/if}
			</section>
		</div>
	{/if}

	<form method="POST" action="?/save" use:enhance={() => ({ update }) => update({ reset: false })} bind:this={formEl} onchange={(e) => { applyNow(e.target as HTMLInputElement); formEl?.requestSubmit(); }} hidden={tab === 'data'}>
		{#each TABS as tb (tb.id)}
			<section hidden={tab !== tb.id}>
				{#if tb.id === 'appearance'}
					<fieldset class="accents">
						<legend>{t('Cor de destaque')}</legend>
						{#each ACCENTS as a (a)}
							<label class="swatch" title={t(ACCENT_LABEL[a])}>
								<input type="radio" name="accent" value={a} checked={prefs().accent === a} />
								<span data-accent={a}></span>
							</label>
						{/each}
					</fieldset>
				{/if}
				{#each tb.fields as f (f.key)}
					<label class="field">
						<span>{t(f.label)}</span>
						<select name={f.key} value={prefs()[f.key]}>
							{#each f.options as [v, text] (v)}<option value={v}>{t(text)}</option>{/each}
						</select>
						{#if f.hint}<small>{t(f.hint)}</small>{/if}
					</label>
				{/each}
				{#if tb.id === 'workflow'}
					<label class="field">
						<span>{t('Diário: apagar concluídos há mais de (dias)')}</span>
						<input type="number" name="retentionDays" min="0" max="3650" value={data.retentionDays} />
						<small>{t('Use 0 para guardar tudo. A limpeza é permanente e roda ao abrir o app.')}</small>
					</label>
				{/if}
			</section>
		{/each}
		{#if tab === 'shortcuts'}
			<table>
				<tbody>
					{#each SHORTCUTS as s (s.keys)}
						<tr><td><kbd>{s.keys}</kbd></td><td>{t(s.label)}</td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
		{#if form?.section === 'prefs' && form.error}<p class="error">{t.msg(form.error)}</p>{/if}
		{#if form?.section === 'prefs' && form.ok}<p class="muted">{t('Salvo automaticamente.')}</p>{/if}
	</form>
</div>

<style>
	.layout {
		display: flex;
		gap: 1.75rem;
		align-items: flex-start;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 10rem;
	}
	nav button {
		text-align: left;
		background: none;
		border: none;
		color: inherit;
		padding: 0.5rem 0.75rem;
		border-radius: 0.4rem;
		cursor: pointer;
	}
	nav button.active {
		background: var(--surface-2);
		font-weight: 600;
	}
	form {
		flex: 1;
		max-width: 28rem;
	}
	section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	section[hidden] {
		display: none;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	small,
	.muted {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.accents {
		border: none;
		padding: 0;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.accents legend {
		margin-bottom: 0.4rem;
	}
	.swatch input {
		position: absolute;
		opacity: 0;
	}
	.swatch span {
		display: block;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
	}
	.swatch input:checked + span {
		border-color: var(--text);
	}
	.swatch input:focus-visible + span {
		outline: 2px solid var(--text);
	}
	span[data-accent='green'] { background: #4fb98a; }
	span[data-accent='blue'] { background: #4f8ef7; }
	span[data-accent='purple'] { background: #9b6bf2; }
	span[data-accent='pink'] { background: #e86fa8; }
	span[data-accent='red'] { background: #e5605b; }
	span[data-accent='orange'] { background: #ee9340; }
	span[data-accent='yellow'] { background: #d9b92f; }
	span[data-accent='teal'] { background: #3fb5c8; }
	span[data-accent='gray'] { background: #8a919e; }
	table {
		border-collapse: collapse;
	}
	td {
		padding: 0.3rem 0.75rem 0.3rem 0;
	}
	.error {
		color: var(--danger);
	}
	.ok {
		color: var(--accent);
	}
	.data {
		flex: 1;
		max-width: 36rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.data section {
		gap: 0.6rem;
	}
	.data form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		max-width: none;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.check {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.days {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
	}
	.token {
		display: block;
		padding: 0.5rem;
		background: var(--surface-2);
		border-radius: 0.4rem;
		overflow-wrap: anywhere;
	}
	.btn {
		display: inline-block;
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 0.4rem;
		text-decoration: none;
	}
	@media (max-width: 700px) {
		.layout {
			flex-direction: column;
		}
	}
</style>
