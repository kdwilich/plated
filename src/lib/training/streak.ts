// Training cadence. Pure, and run in the browser on purpose: the database
// stores UTC, and `date(started_at)` in SQL would put a seven-o'clock evening
// session on the west coast onto tomorrow's square. The server has no idea
// what zone the lifter is in and no reason to store one.

/** Local YYYY-MM-DD. Not `toISOString().slice(0, 10)`, which is UTC. */
export function localDay(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The distinct local days these timestamps fall on, oldest first. */
export function bucketByLocalDay(timestamps: string[]): string[] {
	const days = new Set<string>();
	for (const t of timestamps) {
		const d = new Date(t);
		if (Number.isNaN(d.getTime())) continue;
		days.add(localDay(d));
	}
	return [...days].sort();
}

/** Whole weeks since Monday 5 January 1970, the first Monday of the epoch. */
function weekIndex(day: string): number {
	const [y, m, d] = day.split('-').map(Number);
	return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1970, 0, 5)) / (7 * 86_400_000));
}

/**
 * Consecutive weeks, ending at the present one, that contain at least one
 * finished workout.
 *
 * Weeks rather than days because nobody trains daily, and a day streak that
 * breaks on every rest day measures nothing but guilt. The week in progress
 * counts as grace: an untrained Monday morning should not read as a streak
 * that just ended.
 */
export function currentStreak(days: string[], today: Date): number {
	if (days.length === 0) return 0;
	const trained = new Set(days.map(weekIndex));
	const thisWeek = weekIndex(localDay(today));
	let week = trained.has(thisWeek) ? thisWeek : thisWeek - 1;
	if (!trained.has(week)) return 0;
	let n = 0;
	while (trained.has(week)) {
		n++;
		week--;
	}
	return n;
}
