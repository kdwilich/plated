import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { searchExercises } from '$lib/server/catalog';

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = getDb(platform);
	const q = url.searchParams.get('q') ?? '';
	return json(await searchExercises(db, q));
};
