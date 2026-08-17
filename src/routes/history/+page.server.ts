import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The app is installed as a PWA and something may still hold this URL.
// 308 rather than 301: permanent, and it cannot be rewritten to a GET later.
export const load: PageServerLoad = () => redirect(308, '/you/history');
