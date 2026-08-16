// Builds the scaffold for a new active session: exercises, prescriptions,
// increments, bar weights, and a snapshot of recent history — everything the
// logger needs so a mid-workout dead zone changes nothing.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getGym } from '$lib/server/gym';
import { lastPerformances } from '$lib/server/workouts';
import { incrementFor } from '$lib/training/progression';

export const POST: RequestHandler = async ({ request, platform }) => {
	const db = getDb(platform);
	const { routine_session_id } = (await request.json()) as { routine_session_id?: string };
	const gym = await getGym(db);
	const defaultBar = gym.bars.find((b) => b.is_default) ?? gym.bars[0];

	let sessionName = 'Freestyle';
	let exercises: {
		exercise_id: string;
		name: string;
		measurement: string;
		progression: string;
		equipment: string | null;
		mechanic: string | null;
		movement_pattern: string | null;
		target_sets: number;
		rep_min: number | null;
		rep_max: number | null;
		increment_lb: number;
		bar_lb: number;
	}[] = [];

	if (routine_session_id) {
		const session = await db
			.prepare('SELECT name FROM routine_session WHERE id = ?')
			.bind(routine_session_id)
			.first();
		sessionName = (session?.name as string) ?? 'Session';
		const { results } = await db
			.prepare(
				`SELECT re.target_sets, re.rep_min, re.rep_max, re.increment_lb AS override_lb, re.bar_id,
				        e.id, e.name, e.measurement, e.progression, e.equipment, e.mechanic,
				        e.movement_pattern
				 FROM routine_exercise re JOIN exercise e ON e.id = re.exercise_id
				 WHERE re.session_id = ? ORDER BY re.position`
			)
			.bind(routine_session_id)
			.all();
		exercises = (results as Record<string, unknown>[]).map((r) => ({
			exercise_id: r.id as string,
			name: r.name as string,
			measurement: r.measurement as string,
			progression: r.progression as string,
			equipment: r.equipment as string | null,
			mechanic: r.mechanic as string | null,
			movement_pattern: r.movement_pattern as string | null,
			target_sets: r.target_sets as number,
			rep_min: r.rep_min as number | null,
			rep_max: r.rep_max as number | null,
			increment_lb: incrementFor(r.equipment as string | null, gym, r.override_lb as number | null),
			bar_lb:
				(gym.bars.find((b) => b.id === (r.bar_id as string | null))?.weight_lb ??
					defaultBar?.weight_lb ??
					45)
		}));
	}

	const history = await lastPerformances(db, exercises.map((e) => e.exercise_id));

	return json({
		id: crypto.randomUUID(),
		routine_session_id: routine_session_id ?? null,
		session_name: sessionName,
		started_at: new Date().toISOString(),
		finished_at: null,
		notes: null,
		exercises: exercises.map((e) => ({ ...e, history: history[e.exercise_id] ?? [] })),
		sets: [],
		gym: { plates: gym.plates, dumbbell_step_lb: gym.dumbbell_step_lb, machine_step_lb: gym.machine_step_lb }
	});
};
