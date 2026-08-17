// Every request resolves its user once, here.

import { redirect, type Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { resolveSession, SESSION_COOKIE } from '$lib/server/auth';

// Matched on route id rather than a path prefix: a prefix test can be satisfied
// by a crafted path, and a route id cannot.
const PUBLIC = new Set(['/login', '/signup']);

export const handle: Handle = async ({ event, resolve }) => {
	const db = getDb(event.platform);
	event.locals.user = await resolveSession(db, event.cookies.get(SESSION_COOKIE));

	// Deny by default, so a route added a year from now is protected without
	// anyone remembering to protect it. That is the failure that leaks.
	if (!event.locals.user && event.route.id && !PUBLIC.has(event.route.id)) {
		// A POST is the outbox draining in the background. Redirecting it to an
		// HTML login page would hand the client a page to parse as JSON; a 401
		// is what the outbox is built to survive.
		if (event.request.method !== 'GET') return new Response('Unauthorized', { status: 401 });
		redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	}

	return resolve(event);
};
