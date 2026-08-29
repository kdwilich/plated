import type { RequestHandler } from './$types';
import { APP_SLUG } from '$lib/brand';
import { getDb } from '$lib/server/db';
import { exportWorkouts } from '$lib/server/stats';

export const GET: RequestHandler = async ({ platform, locals }) => {
	const db = getDb(platform);
	const data = await exportWorkouts(db, locals.user!.id);
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(JSON.stringify(data, null, '\t'), {
		headers: {
			'content-type': 'application/json',
			// Named and dated, because a file called "export" in a downloads
			// folder is a file nobody can identify a year later.
			'content-disposition': `attachment; filename="-.json"`
		}
	});
};
