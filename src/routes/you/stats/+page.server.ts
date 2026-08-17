import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getActiveRoutine, routineToDraft } from '$lib/server/routines';
import { headlineRecords, lifetimeTotals, trainedInWindow } from '$lib/server/stats';
import { actualSetsByGroup, weeklySetsByGroup } from '$lib/training/volume';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = getDb(platform);
	const uid = locals.user!.id;
	const [totals, week, month, records, routine] = await Promise.all([
		lifetimeTotals(db, uid),
		trainedInWindow(db, uid, 7),
		trainedInWindow(db, uid, 28),
		headlineRecords(db, uid),
		getActiveRoutine(db, uid)
	]);
	return {
		totals,
		records,
		last7: actualSetsByGroup(week),
		last28: actualSetsByGroup(month),
		// The plan, scored by the same rules, so the two columns are comparable.
		planned: routine ? weeklySetsByGroup(routineToDraft(routine)) : {}
	};
};
