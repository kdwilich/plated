import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listExercises } from '$lib/server/catalog';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);
	return { top: await listExercises(db, { limit: 60 }) };
};
