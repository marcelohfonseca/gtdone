import { isList } from '#lib/gtd/core.ts';
import { isNamedKind } from '#lib/gtd/organize.ts';

// Os matchers seguem o Standard Schema exigido pelo SvelteKit.
function matcher(test: (value: string) => boolean) {
	return {
		'~standard': {
			version: 1 as const,
			vendor: 'gtdone',
			validate: (value: unknown) =>
				typeof value === 'string' && test(value)
					? { value }
					: { issues: [{ message: 'valor inválido' }] }
		}
	};
}

export const params = {
	list: matcher(isList),
	kind: matcher(isNamedKind)
};
