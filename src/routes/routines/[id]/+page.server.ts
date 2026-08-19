import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import {
	activateRoutine,
	addRoutineExercise,
	addRoutineSession,
	deleteRoutine,
	deleteRoutineExercise,
	deleteRoutineSession,
	duplicateRoutine,
	getRoutine,
	moveRoutineSession,
	renameRoutine,
	renameRoutineSession,
	routineToDraft,
	updateRoutineExercise
} from '$lib/server/routines';
import { getExercise } from '$lib/server/catalog';
import { PROFILES, prescriptionFor } from '$lib/training/profiles';
import { volumeSummary, volumeWarnings, weeklySetsByGroup } from '$lib/training/volume';

// `locals.user!` throughout: hooks.server.ts guarantees a user on every
// non-public route, and none of these are public. A defensive branch here
// could never be taken.
export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const db = getDb(platform);
	const uid = locals.user!.id;
	const routine = await getRoutine(db, uid, params.id);
	if (!routine) error(404, 'No such routine');
	// Recomputed on every load rather than stored with the routine: this page
	// edits exercises and sets, and a warning saved at generate time would go
	// on insisting a muscle was neglected after you added the exercise that
	// fixed it.
	const draft = routineToDraft(routine);
	const profile = PROFILES[routine.profile_key] ?? PROFILES.hypertrophy;
	const warnings = volumeWarnings(draft, profile);
	return {
		routine,
		profiles: Object.values(PROFILES),
		volume: weeklySetsByGroup(draft),
		warnings,
		warningSummary: volumeSummary(warnings, profile)
	};
};

export const actions: Actions = {
	update: async ({ request, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'missing id' });
		await updateRoutineExercise(db, uid, id, {
			target_sets: Number(form.get('target_sets')) || 3,
			rep_min: Number(form.get('rep_min')) || 6,
			rep_max: Number(form.get('rep_max')) || 10
		});
		return { ok: true };
	},

	remove: async ({ request, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'missing id' });
		await deleteRoutineExercise(db, uid, id);
		return { ok: true };
	},

	add: async ({ request, params, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const sessionId = form.get('session_id') as string;
		const exerciseId = form.get('exercise_id') as string;
		if (!sessionId || !exerciseId) return fail(400, { error: 'missing ids' });
		// The routine's own profile decides the numbers, and the catalog's
		// mechanic decides which half of it applies.
		const routine = await getRoutine(db, uid, params.id);
		const profile = PROFILES[routine?.profile_key ?? ''] ?? PROFILES.hypertrophy;
		const exercise = await getExercise(db, exerciseId);
		await addRoutineExercise(db, uid, sessionId, exerciseId, prescriptionFor(profile, exercise?.mechanic));
		return { ok: true };
	},

	swap: async ({ request, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const id = form.get('id') as string;
		const exerciseId = form.get('exercise_id') as string;
		if (!id || !exerciseId) return fail(400, { error: 'missing ids' });
		await updateRoutineExercise(db, uid, id, { exercise_id: exerciseId });
		return { ok: true };
	},

	rename: async ({ request, params, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const name = (form.get('name') as string)?.trim();
		if (!name) return fail(400, { error: 'A routine needs a name.' });
		await renameRoutine(db, uid, params.id, name);
		return { ok: true };
	},

	add_session: async ({ params, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		await addRoutineSession(db, uid, params.id, 'New day');
		return { ok: true };
	},

	rename_session: async ({ request, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const id = form.get('id') as string;
		const name = (form.get('name') as string)?.trim();
		if (!id) return fail(400, { error: 'missing id' });
		if (!name) return fail(400, { error: 'A day needs a name.' });
		await renameRoutineSession(db, uid, id, name);
		return { ok: true };
	},

	remove_session: async ({ request, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'missing id' });
		await deleteRoutineSession(db, uid, id);
		return { ok: true };
	},

	move_session: async ({ request, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const form = await request.formData();
		const id = form.get('id') as string;
		const dir = form.get('dir') as string;
		if (!id || (dir !== 'up' && dir !== 'down')) return fail(400, { error: 'missing id' });
		await moveRoutineSession(db, uid, id, dir);
		return { ok: true };
	},

	activate: async ({ params, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const routine = await getRoutine(db, uid, params.id);
		if (!routine) return fail(404, { error: 'No such routine.' });
		// An active routine with nothing in it makes the home page a dead end:
		// session cards you can start that hold no exercises.
		const exercises = routine.sessions.reduce((n, s) => n + s.exercises.length, 0);
		if (exercises === 0) {
			return fail(400, { error: 'Add at least one exercise before making this your routine.' });
		}
		await activateRoutine(db, uid, params.id);
		return { ok: true };
	},

	duplicate: async ({ params, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		const copy = await duplicateRoutine(db, uid, params.id);
		if (!copy) return fail(404, { error: 'No such routine.' });
		redirect(303, `/routines/${copy}`);
	},

	delete: async ({ params, platform, locals }) => {
		const db = getDb(platform);
		const uid = locals.user!.id;
		await deleteRoutine(db, uid, params.id);
		redirect(303, '/routines');
	}
};
