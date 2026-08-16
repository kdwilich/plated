/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Platform {
			env: {
				DB: D1Database;
			};
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
