import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions } from './$types';
import { getDb } from '$lib/server/db';
import { createSession, createUser, SESSION_COOKIE, SESSION_DAYS } from '$lib/server/auth';
import { bootstrapUser } from '$lib/server/gym';

const MIN_PASSWORD = 10;

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const email = ((form.get('email') as string) ?? '').trim();
		const password = (form.get('password') as string) ?? '';

		if (!email.includes('@')) return fail(400, { email, error: 'That does not look like an email address.' });
		if (password.length < MIN_PASSWORD) {
			return fail(400, { email, error: `Use at least ${MIN_PASSWORD} characters.` });
		}

		const user = await createUser(db, email, password);
		if (!user) return fail(400, { email, error: 'That email is already registered.' });

		await bootstrapUser(db, user.id);
		cookies.set(SESSION_COOKIE, await createSession(db, user.id), {
			path: '/',
			httpOnly: true,
			// wrangler dev serves plain HTTP, and a Secure cookie is dropped
			// there — the whole flow would appear to work and never sign anyone in.
			secure: !dev,
			sameSite: 'lax',
			maxAge: SESSION_DAYS * 86_400
		});
		redirect(303, '/');
	}
};
