import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { runSets } from '$lib/server/stats';

/** The last month of runs, for the spike line under the distance. 31 days so
 *  the browser's own 30-day window is covered whatever zone it is in. */
export const load: PageServerLoad = async ({ platform, locals }) => ({
	recent: await runSets(getDb(platform), locals.user!.id, 31)
});
