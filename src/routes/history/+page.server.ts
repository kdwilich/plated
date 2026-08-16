import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { recentWorkouts } from '$lib/server/workouts';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);
	return { workouts: await recentWorkouts(db) };
};
