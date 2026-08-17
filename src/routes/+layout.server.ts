import type { LayoutServerLoad } from './$types';

/** So the layout can hide its chrome when nobody is signed in. */
export const load: LayoutServerLoad = async ({ locals }) => ({ user: locals.user });
