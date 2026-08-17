/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
			};
		}

		/** Resolved once per request in hooks.server.ts. Routes read this and
		 *  never look at cookies themselves. */
		interface Locals {
			user: import('$lib/server/auth').SessionUser | null;
		}

		/** Shallow-routed state. `guide` holds the /exercises/[id] load result,
		 *  so the guide can open as a modal without unmounting the page. */
		interface PageState {
			guide?: {
				exercise: import('$lib/server/catalog').ExerciseRow;
				history: import('$lib/training/types').LoggedSet[][];
			};
		}
	}
}

export {};
