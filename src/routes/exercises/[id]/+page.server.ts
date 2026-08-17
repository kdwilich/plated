import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getExercise } from '$lib/server/catalog';
import { exerciseSets, lastPerformances } from '$lib/server/workouts';
import { bestRecords } from '$lib/training/records';

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = getDb(platform);
	const exercise = await getExercise(db, params.id);
	if (!exercise) throw error(404, 'No such exercise');
	const uid = locals.user!.id;
	const [history, sets] = await Promise.all([
		lastPerformances(db, uid, [params.id]),
		exerciseSets(db, uid, params.id)
	]);
	return {
		exercise,
		history: history[params.id] ?? [],
		records: bestRecords(sets, exercise.measurement)
	};
};
