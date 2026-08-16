import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { findExercises } from '$lib/server/catalog';
import { FORCES, type Force } from '$lib/training/filters';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = getDb(platform);
	const force = url.searchParams.get('force');
	return json(
		await findExercises(db, {
			q: url.searchParams.get('q') ?? '',
			group: url.searchParams.get('group'),
			equipment: url.searchParams.get('equipment'),
			force: FORCES.includes(force as Force) ? (force as Force) : null
		})
	);
};
