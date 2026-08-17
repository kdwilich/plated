import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { recentWorkouts } from '$lib/server/workouts';
import { trainingDays } from '$lib/server/stats';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = getDb(platform);
	const uid = locals.user!.id;
	const [days, workouts] = await Promise.all([trainingDays(db, uid), recentWorkouts(db, uid, 5)]);
	return { days, workouts };
};
