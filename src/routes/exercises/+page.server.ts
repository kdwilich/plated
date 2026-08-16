import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { listExercises } from '$lib/server/catalog';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);
	// The whole catalog, alphabetically — the list is for looking a name up,
	// and a truncated A-to-B slice of 873 exercises would be useless.
	const exercises = await listExercises(db, { limit: 2000 });
	return { exercises };
};
