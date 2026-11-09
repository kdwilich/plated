import type { PageServerLoad } from './$types';

/** Nothing to load. The file exists so the route has a server pass like every
 *  other page: hooks.server.ts redirects a signed-out visit before a form whose
 *  submission would 401 at the outbox ever renders. */
export const load: PageServerLoad = async () => ({});
