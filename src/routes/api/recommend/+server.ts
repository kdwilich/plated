// What to swap an exercise for, or what else belongs in the day.
//
//   ?for=<id>        substitutes for that exercise
//   ?in=<id,id,...>  what the session already contains
//
// With `for`, `in` is the exclude list. Without it, `in` is the session being
// complemented — and an empty `in` returns nothing, which is exactly right for
// a freestyle workout that has not started.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { getGym } from '$lib/server/gym';
import { allExercises, getExercise } from '$lib/server/catalog';
import { rankAlternatives, rankComplements } from '$lib/training/alternatives';

export const GET: RequestHandler = async ({ url, platform, locals }) => {
	const db = getDb(platform);
	const forId = url.searchParams.get('for');
	const inIds = (url.searchParams.get('in') ?? '').split(',').filter(Boolean);

	if (!forId && inIds.length === 0) return json([]);

	const [gym, catalog] = await Promise.all([getGym(db, locals.user!.id), allExercises(db)]);

	if (forId) {
		const target = await getExercise(db, forId);
		if (!target) return json({ error: 'not found' }, { status: 404 });
		return json(
			rankAlternatives(target, catalog, { equipment: gym.equipment, exclude: inIds })
		);
	}

	const present = new Set(inIds);
	const current = catalog.filter((e) => present.has(e.id));
	return json(rankComplements(current, catalog, { equipment: gym.equipment }));
};
