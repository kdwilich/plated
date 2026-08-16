import { error } from '@sveltejs/kit';

export function getDb(platform: App.Platform | undefined): D1Database {
	const db = platform?.env?.DB;
	if (!db) {
		// `npm run dev` has no platform.env — use `npm run dev:wrangler`.
		throw error(500, 'D1 binding missing. Run with `npm run dev:wrangler`.');
	}
	return db;
}
