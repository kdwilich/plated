import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getGym } from '$lib/server/gym';
import { activateRoutine, createRoutine, listRoutines } from '$lib/server/routines';
import { PROFILES } from '$lib/training/profiles';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);
	return { routines: await listRoutines(db), profiles: Object.values(PROFILES) };
};

export const actions: Actions = {
	create: async ({ platform }) => {
		const db = getDb(platform);
		const gym = await getGym(db);
		// Inherit the approach you are already training under, so a hand-built
		// routine prescribes the same way the generated one did.
		const active = (await listRoutines(db)).find((r) => r.is_active);
		const id = await createRoutine(db, 'New routine', active?.profile_key ?? 'hypertrophy', gym.id);
		redirect(303, `/routines/${id}`);
	},

	activate: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'missing id' });
		const routine = (await listRoutines(db)).find((r) => r.id === id);
		if (!routine) return fail(404, { error: 'No such routine.' });
		if (routine.exercise_count === 0) {
			return fail(400, { error: `"${routine.name}" has no exercises yet.` });
		}
		await activateRoutine(db, id);
		return { ok: true };
	}
};
