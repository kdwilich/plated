// Context for one exercise added mid-session (freestyle or extra work).

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getGym } from '$lib/server/gym';
import { getExercise } from '$lib/server/catalog';
import { lastPerformances } from '$lib/server/workouts';
import { incrementFor } from '$lib/training/progression';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = getDb(platform);
	const id = url.searchParams.get('id');
	if (!id) return json({ error: 'missing id' }, { status: 400 });
	const ex = await getExercise(db, id);
	if (!ex) return json({ error: 'not found' }, { status: 404 });
	const gym = await getGym(db);
	const defaultBar = gym.bars.find((b) => b.is_default) ?? gym.bars[0];
	const history = await lastPerformances(db, [id]);
	return json({
		exercise_id: ex.id,
		name: ex.name,
		measurement: ex.measurement,
		progression: ex.progression,
		equipment: ex.equipment,
		mechanic: ex.mechanic,
		movement_pattern: ex.movement_pattern,
		target_sets: 3,
		rep_min: 8,
		rep_max: 12,
		increment_lb: incrementFor(ex.equipment, gym),
		bar_lb: defaultBar?.weight_lb ?? 45,
		history: history[id] ?? []
	});
};
