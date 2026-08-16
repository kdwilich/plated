import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	addRoutineExercise,
	deleteRoutineExercise,
	getActiveRoutine,
	updateRoutineExercise
} from '$lib/server/routines';
import { PROFILES } from '$lib/training/profiles';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);
	const routine = await getActiveRoutine(db);
	return { routine, profiles: Object.values(PROFILES) };
};

export const actions: Actions = {
	update: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'missing id' });
		await updateRoutineExercise(db, id, {
			target_sets: Number(form.get('target_sets')) || 3,
			rep_min: Number(form.get('rep_min')) || 6,
			rep_max: Number(form.get('rep_max')) || 10
		});
		return { ok: true };
	},
	remove: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'missing id' });
		await deleteRoutineExercise(db, id);
		return { ok: true };
	},
	add: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const sessionId = form.get('session_id') as string;
		const exerciseId = form.get('exercise_id') as string;
		if (!sessionId || !exerciseId) return fail(400, { error: 'missing ids' });
		await addRoutineExercise(db, sessionId, exerciseId, {
			target_sets: 3,
			rep_min: 8,
			rep_max: 12,
			rir_target: 2
		});
		return { ok: true };
	},
	swap: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const id = form.get('id') as string;
		const exerciseId = form.get('exercise_id') as string;
		if (!id || !exerciseId) return fail(400, { error: 'missing ids' });
		await updateRoutineExercise(db, id, { exercise_id: exerciseId });
		return { ok: true };
	}
};
