import { fail } from '@sveltejs/kit';
import { GtdError } from '#lib/gtd/core.ts';
import { createNamed, deleteNamed, listNamed, renameNamed, type NamedKind } from '#lib/gtd/organize.ts';
import { getDb } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

const TITLES: Record<NamedKind, string> = { areas: 'Áreas', tags: 'Tags', contacts: 'Contatos' };

export const load: PageServerLoad = ({ params }) => {
	const kind = params.kind as NamedKind;
	return { kind, title: TITLES[kind], entries: listNamed(getDb(), kind) };
};

function run(fn: (kind: NamedKind, fd: FormData) => void) {
	return async ({ request, params }: { request: Request; params: { kind: string } }) => {
		try {
			fn(params.kind as NamedKind, await request.formData());
			return { ok: true };
		} catch (e) {
			if (e instanceof GtdError) return fail(e.status, { error: e.message });
			throw e;
		}
	};
}

export const actions: Actions = {
	create: run((kind, fd) => {
		createNamed(getDb(), kind, fd.get('name'));
	}),
	rename: run((kind, fd) => renameNamed(getDb(), kind, Number(fd.get('id')), fd.get('name'))),
	delete: run((kind, fd) => deleteNamed(getDb(), kind, Number(fd.get('id'))))
};
