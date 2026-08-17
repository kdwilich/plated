import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { ingestWorkout, type SyncPayload } from '$lib/server/workouts';

export const POST: RequestHandler = async ({ request, platform, locals }) => {
	const db = getDb(platform);
	const payload = (await request.json()) as SyncPayload;
	if (!payload?.workout?.id || !Array.isArray(payload.sets)) {
		return json({ ok: false, error: 'malformed payload' }, { status: 400 });
	}
	// The owner comes from the session. Nothing in the body influences it.
	await ingestWorkout(db, locals.user!.id, payload);
	return json({ ok: true, id: payload.workout.id });
};
