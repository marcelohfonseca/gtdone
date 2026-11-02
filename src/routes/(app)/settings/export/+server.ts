import { exportData } from '#lib/gtd/portability.ts';
import { getDb } from '#lib/server/db.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const now = new Date();
	return new Response(JSON.stringify(exportData(getDb(), now), null, 1), {
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'content-disposition': `attachment; filename="gtdone-${now.toISOString().slice(0, 10)}.json"`,
			'cache-control': 'no-store'
		}
	});
};
