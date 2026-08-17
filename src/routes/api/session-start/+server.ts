// Builds the scaffold for a new active session: exercises, prescriptions,
// increments, bar weights, and a snapshot of recent history — everything the
// logger needs so a mid-workout dead zone changes nothing.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getGym } from '$lib/server/gym';
import { sessionScaffold } from '$lib/server/routines';
import { lastPerformances } from '$lib/server/workouts';
import { incrementFor } from '$lib/training/progression';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const db = getDb(platform);
	const userId = locals.user!.id;
	const { routine_session_id } = (await request.json()) as { routine_session_id?: string };
	const gym = await getGym(db, userId);
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
		const scaffold = await sessionScaffold(db, userId, routine_session_id);
		if (!scaffold) return json({ error: 'not found' }, { status: 404 });
		sessionName = scaffold.name;
		// The query belongs in routines.ts; the equipment arithmetic belongs here.
		exercises = scaffold.exercises.map((e) => ({
			exercise_id: e.exercise_id,
			name: e.name,
			measurement: e.measurement,
			progression: e.progression,
			equipment: e.equipment,
			mechanic: e.mechanic,
			movement_pattern: e.movement_pattern,
			target_sets: e.target_sets,
			rep_min: e.rep_min,
			rep_max: e.rep_max,
			increment_lb: incrementFor(e.equipment, gym, e.override_lb),
			bar_lb: gym.bars.find((b) => b.id === e.bar_id)?.weight_lb ?? defaultBar?.weight_lb ?? 45
		}));
	}

	const history = await lastPerformances(db, userId, exercises.map((e) => e.exercise_id));

	return json({
		id: crypto.randomUUID(),
		// Stamped so a shared device does not resume one person's workout as
		// another's. The server trusts its own session, not this field.
		user_id: userId,
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
