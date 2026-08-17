import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { authenticate, createSession, SESSION_COOKIE, SESSION_DAYS } from '$lib/server/auth';

/** Only a same-origin absolute path. Anything else is an open redirect. */
function safeNext(next: string | null): string {
	if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
	return next;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	return { next: safeNext(url.searchParams.get('next')) };
};

export const actions: Actions = {
	default: async ({ request, cookies, platform, url }) => {
		const db = getDb(platform);
		const form = await request.formData();
		const email = ((form.get('email') as string) ?? '').trim();
		const password = (form.get('password') as string) ?? '';

		const user = await authenticate(db, email, password);
		// One message for both failures. Telling someone the address exists but
		// the password is wrong is an account-enumeration oracle.
		if (!user) return fail(400, { email, error: 'Email or password is wrong.' });

		cookies.set(SESSION_COOKIE, await createSession(db, user.id), {
			path: '/',
			httpOnly: true,
			secure: !dev,
			sameSite: 'lax',
			maxAge: SESSION_DAYS * 86_400
		});
		redirect(303, safeNext((form.get('next') as string) ?? url.searchParams.get('next')));
	}
};
