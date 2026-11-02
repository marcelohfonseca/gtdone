import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';

// Todas as ações compartilhadas vivem em /inbox?/<nome>; devolve a mensagem de erro, se houver.
export async function postAction(
	name: string,
	data: Record<string, string | number | boolean | null | undefined>,
	path = '/inbox'
): Promise<string | null> {
	const body = new FormData();
	for (const [k, v] of Object.entries(data)) if (v != null) body.set(k, String(v));
	const res = await fetch(`${path}?/${name}`, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});
	const result = deserialize(await res.text());
	if (result.type === 'redirect') {
		const { goto } = await import('$app/navigation');
		await goto(result.location, { invalidateAll: true });
		return null;
	}
	if (result.type === 'failure') return String(result.data?.error ?? 'erro');
	if (result.type === 'error') return 'erro inesperado';
	await invalidateAll();
	return null;
}
