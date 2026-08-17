import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getGym, saveGym } from '$lib/server/gym';

const EQUIPMENT_KEYS = [
	'barbell',
	'dumbbell',
	'machine',
	'cable',
	'body only',
	'e-z curl bar',
	'kettlebells',
	'bands',
	'medicine ball',
	'exercise ball'
];

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = getDb(platform);
	return { gym: await getGym(db, locals.user!.id), equipmentKeys: EQUIPMENT_KEYS };
};

export const actions: Actions = {
	save: async ({ request, platform, locals }) => {
		const db = getDb(platform);
		// The gym's id comes from the database, never from the form. Nothing
		// posted can redirect this write at another account's gym.
		const gymId = (await getGym(db, locals.user!.id)).id;
		const form = await request.formData();

		const equipment = EQUIPMENT_KEYS.filter((k) => form.get(`eq:${k}`) === 'on');

		// "45x10, 35x2, 25x2" — pairs optional, default 10
		const plates: { denomination_lb: number; pairs: number }[] = [];
		for (const part of ((form.get('plates') as string) ?? '').split(',')) {
			const m = part.trim().match(/^(\d+(?:\.\d+)?)\s*(?:x\s*(\d+))?$/i);
			if (!m) continue;
			plates.push({ denomination_lb: Number(m[1]), pairs: m[2] ? Number(m[2]) : 10 });
		}
		if (plates.length === 0) return fail(400, { error: 'List at least one plate, e.g. "45x10, 25x2, 10x4, 5x2, 2.5x2".' });

		// "Straight bar:45*, EZ curl:25" — * marks the default
		const bars: { id: string; name: string; weight_lb: number; is_default: boolean }[] = [];
		for (const part of ((form.get('bars') as string) ?? '').split(',')) {
			const m = part.trim().match(/^(.+?):\s*(\d+(?:\.\d+)?)(\*)?$/);
			if (!m) continue;
			const name = m[1].trim();
			bars.push({
				// Suffixed with the gym: gym_bar's primary key is shared across
				// accounts, and two people both owning a "Straight bar" would
				// otherwise collide on bar-straight-bar.
				id: `bar-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${gymId}`,
				name,
				weight_lb: Number(m[2]),
				is_default: !!m[3]
			});
		}
		if (bars.length > 0 && !bars.some((b) => b.is_default)) bars[0].is_default = true;

		await saveGym(db, locals.user!.id, {
			id: gymId,
			name: ((form.get('name') as string) ?? 'My gym').trim() || 'My gym',
			dumbbell_step_lb: Number(form.get('dumbbell_step')) || 5,
			machine_step_lb: Number(form.get('machine_step')) || 10,
			equipment,
			plates,
			bars
		});
		redirect(303, '/routines');
	}
};
