import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getGym } from '$lib/server/gym';
import { generatorCatalog } from '$lib/server/catalog';
import { saveRoutineFromDraft } from '$lib/server/routines';
import { defaultSplitStyle, generate, type SplitStyle } from '$lib/training/generate';
import { weeklySetsByGroup } from '$lib/training/volume';
import { PROFILES } from '$lib/training/profiles';
import type { RoutineDraft } from '$lib/training/types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform);
	const gym = await getGym(db);
	return { gym, profiles: Object.values(PROFILES) };
};

export const actions: Actions = {
	generate: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const days = Number(form.get('days'));
		const profileKey = (form.get('profile') as string) || 'hypertrophy';
		if (![2, 3, 4, 5, 6].includes(days)) return fail(400, { error: 'Pick 2–6 days.' });

		const raw = form.get('split_style') as string | null;
		const splitStyle: SplitStyle =
			raw === 'full_body' || raw === 'targeted' ? raw : defaultSplitStyle(days);

		const gym = await getGym(db);
		const catalog = await generatorCatalog(db);
		const draft = generate({
			daysPerWeek: days as 2 | 3 | 4 | 5 | 6,
			equipment: gym.equipment,
			profileKey,
			splitStyle,
			catalog
		});
		return {
			draft,
			volume: weeklySetsByGroup(draft),
			profile: PROFILES[profileKey],
			days,
			splitStyle
		};
	},
	save: async ({ request, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const raw = form.get('draft') as string;
		const name = (form.get('name') as string)?.trim() || 'My split';
		if (!raw) return fail(400, { error: 'Nothing to save.' });
		let draft: RoutineDraft;
		try {
			draft = JSON.parse(raw);
		} catch {
			return fail(400, { error: 'Malformed draft.' });
		}
		const gym = await getGym(db);
		await saveRoutineFromDraft(db, draft, name, gym.id);
		redirect(303, '/routines');
	}
};
