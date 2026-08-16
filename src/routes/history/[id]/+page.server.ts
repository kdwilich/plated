import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { workoutDetail } from '$lib/server/workouts';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = getDb(platform);
	const detail = await workoutDetail(db, params.id);
	if (!detail.workout) throw error(404, 'No such workout');
	return detail;
};
