import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getExercise } from '$lib/server/catalog';
import { lastPerformances } from '$lib/server/workouts';

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = getDb(platform);
	const exercise = await getExercise(db, params.id);
	if (!exercise) throw error(404, 'No such exercise');
	const history = await lastPerformances(db, locals.user!.id, [params.id]);
	return { exercise, history: history[params.id] ?? [] };
};
