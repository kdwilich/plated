import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { deleteWorkout, recentWorkouts } from '$lib/server/workouts';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);
	return { workouts: await recentWorkouts(db) };
};

export const actions: Actions = {
	delete: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const id = form.get('id') as string;
		if (!id) return fail(400, { error: 'missing id' });
		await deleteWorkout(db, id);
		return { ok: true };
	}
};
