import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { changePassword, getUserProfile, SESSION_COOKIE } from '$lib/server/auth';

const MIN_PASSWORD = 10;

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = getDb(platform);
	return { profile: await getUserProfile(db, locals.user!.id) };
};

export const actions: Actions = {
	password: async ({ request, platform, locals, cookies }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const current = (form.get('current') as string) ?? '';
		const next = (form.get('next') as string) ?? '';
		const confirm = (form.get('confirm') as string) ?? '';

		if (next.length < MIN_PASSWORD) {
			return fail(400, { error: `Use at least ${MIN_PASSWORD} characters.` });
		}
		if (next !== confirm) return fail(400, { error: 'The two new passwords do not match.' });

		// The caller's own token, so the device doing this stays signed in.
		const kept = cookies.get(SESSION_COOKIE);
		const ok = await changePassword(db, locals.user!.id, current, next, kept);
		if (!ok) return fail(400, { error: 'That is not your current password.' });
		return { ok: true };
	}
};
