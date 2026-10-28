<script lang="ts">
	import { enhance } from '$app/forms';
	let { form }: { form: { error?: string; email?: string } } = $props();
</script>

<main>
	<h1>GTDone</h1>
	<h2>Criar conta inicial</h2>
	<p>Primeiro uso: defina o email e a senha da sua conta única.</p>
	<form method="POST" use:enhance>
		<label>
			Email
			<input name="email" type="email" required value={form?.email ?? ''} />
		</label>
		<label>
			Senha (mínimo 8 caracteres)
			<input name="password" type="password" required minlength={8} />
		</label>
		<button type="submit">Criar conta</button>
		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}
	</form>
</main>

<style>
	main {
		font-family:
			ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
			sans-serif;
		max-width: 24rem;
		margin: 10vh auto 0 auto;
		padding: 0 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	p {
		color: #555;
		font-size: 0.9rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
	}
	input {
		padding: 0.5rem 0.75rem;
		border: 1px solid #ccc;
		border-radius: 0.375rem;
		font-size: 1rem;
	}
	button {
		padding: 0.55rem;
		border: none;
		border-radius: 0.375rem;
		background: #1b7f5c;
		color: white;
		font-size: 1rem;
		cursor: pointer;
	}
	.error {
		color: #b3261e;
		margin: 0;
	}
</style>
