<script lang="ts">
	import { enhance } from '$app/forms';
</script>

<main>
	<h1>GTDone</h1>
	<p>Gestão de tarefas e projetos com GTD.</p>
	<p><small>Sessão ativa · Fase 0</small></p>
	<form method="POST" action="/logout" use:enhance>
		<button type="submit">Sair</button>
	</form>
</main>

<style>
	main {
		font-family:
			ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
			sans-serif;
		max-width: 40rem;
		margin: 20vh auto 0 auto;
		padding: 0 1.5rem;
		text-align: center;
	}
	h1 {
		font-size: 2.5rem;
		margin-bottom: 0.5rem;
	}
	p {
		color: #555;
	}
	small {
		color: #888;
	}
	form {
		display: inline-block;
		margin-top: 1rem;
	}
	button {
		padding: 0.5rem 1.25rem;
		border: 1px solid #ccc;
		border-radius: 0.375rem;
		background: white;
		color: #333;
		font-size: 0.95rem;
		cursor: pointer;
	}
	button:hover {
		background: #f4f4f4;
	}
</style>
