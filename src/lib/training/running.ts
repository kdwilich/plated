// Running, the parts that are arithmetic. Pure — no DOM, no D1, no $lib
// imports — so it runs under `node --test` like the rest of the training core.
//
// Metres and seconds are stored; miles and m:ss are shown. The conversion
// happens here and nowhere else, and pace is always derived, never stored:
// three independently editable numbers that must agree is how a log starts
// lying.

import { localDay, weekIndex } from './streak.ts';

export const MILE_M = 1609.344;
export const miles = (m: number): number => m / MILE_M;
export const metres = (mi: number): number => mi * MILE_M;

/** Seconds per mile, or null when either side is missing or zero. */
export function paceSecPerMi(distanceM: number | null, durationS: number | null): number | null {
	if (!distanceM || !durationS || distanceM <= 0 || durationS <= 0) return null;
	return durationS / miles(distanceM);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "7:53" from seconds per mile. */
export function fmtPace(secPerMi: number): string {
	const s = Math.round(secPerMi);
	return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** "24:30", or "1:02:05" past an hour. Always at least m:ss, so 45 s is "0:45". */
export function fmtClock(seconds: number): string {
	const s = Math.round(seconds);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const rest = pad(s % 60);
	return h > 0 ? `${h}:${pad(m)}:${rest}` : `${m}:${rest}`;
}

/** Two decimals: the resolution a watch reports, and enough to tell 3.10 from 3.11. */
export const fmtMiles = (m: number): string => miles(m).toFixed(2);

export const RUN_TYPES = ['easy', 'long', 'tempo', 'intervals', 'race'] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const isRunType = (s: unknown): s is RunType =>
	typeof s === 'string' && (RUN_TYPES as readonly string[]).includes(s);

/** Whole-run effort. Separate from a set's RIR, which the logger never writes. */
export const isEffort = (n: unknown): n is number =>
	typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10;

const LABEL: Record<RunType, string> = {
	easy: 'Easy run',
	long: 'Long run',
	tempo: 'Tempo run',
	intervals: 'Intervals',
	race: 'Race'
};

/** "Easy run" — one place, so history, the hub and the detail page agree. */
export const runLabel = (t: RunType): string => LABEL[t];

/**
 * "24:30" -> 1470, "1:02:05" -> 3725, "45" -> 45. Null for anything a clock
 * would not show: 75 seconds, a 60th minute, negatives, empty, and zero,
 * because a zero-length run is not a run.
 */
export function parseClock(input: string): number | null {
	const parts = input.trim().split(':');
	if (parts.length < 1 || parts.length > 3) return null;
	if (!parts.every((p) => /^\d+$/.test(p))) return null;
	const nums = parts.map(Number);
	// Every part after the first is a minute or second field: under sixty.
	if (nums.slice(1).some((n) => n >= 60)) return null;
	const total = nums.reduce((acc, n) => acc * 60 + n, 0);
	return total > 0 ? total : null;
}

/**
 * What the time field shows as it is typed. A phone's number pad has no
 * colon, so digits fill from the right like a stopwatch: 2430 is 24:30,
 * 10205 is 1:02:05. Anything that is not a digit is dropped, so a pasted
 * "24:30" survives, and leading zeros go. Six digits at most, h:mm:ss.
 */
export function clockInput(raw: string): string {
	const d = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6);
	if (d.length <= 2) return d;
	const ss = d.slice(-2);
	const rest = d.slice(0, -2);
	if (rest.length <= 2) return `${rest}:${ss}`;
	return `${rest.slice(0, -2)}:${rest.slice(-2)}:${ss}`;
}

export type RunForm =
	| { ok: true; distance_m: number; duration_s: number }
	| { ok: false; error: string };

/** The two inputs the form has, validated into the two numbers the set stores. */
export function parseRunForm(input: { miles: string; clock: string }): RunForm {
	const mi = Number(input.miles.trim());
	if (!input.miles.trim() || !Number.isFinite(mi) || mi <= 0) return { ok: false, error: 'How far?' };
	const duration_s = parseClock(input.clock);
	if (duration_s === null) return { ok: false, error: 'How long? m:ss or h:mm:ss' };
	// Whole metres. Two-decimal miles are the input resolution anyway.
	return { ok: true, distance_m: Math.round(metres(mi)), duration_s };
}

/** "3.11 mi · 24:30 · 7:53/mi". A distance-only or time-only set shows what it has. */
export function runLine(distanceM: number | null, durationS: number | null): string {
	const parts: string[] = [];
	if (distanceM) parts.push(`${fmtMiles(distanceM)} mi`);
	if (durationS) parts.push(fmtClock(durationS));
	const pace = paceSecPerMi(distanceM, durationS);
	if (pace !== null) parts.push(`${fmtPace(pace)}/mi`);
	return parts.join(' · ');
}

export interface ActivityRow {
	started_at: string;
	run_type: string | null;
	distance_m: number | null;
}

/**
 * The strip on Train: what this week holds so far. Bucketed in the browser
 * by local day and the Monday-start week streak.ts uses, so the strip and the
 * streak can never disagree about which week it is. Rows older than this
 * week are ignored rather than trusted to have been filtered upstream.
 */
export function weekSoFar(rows: ActivityRow[], today: Date): { lifts: number; runs: number; miles: number } {
	const thisWeek = weekIndex(localDay(today));
	let lifts = 0;
	let runs = 0;
	let m = 0;
	for (const r of rows) {
		const d = new Date(r.started_at);
		if (Number.isNaN(d.getTime()) || weekIndex(localDay(d)) !== thisWeek) continue;
		if (r.run_type) {
			runs++;
			m += r.distance_m ?? 0;
		} else {
			lifts++;
		}
	}
	return { lifts, runs, miles: miles(m) };
}

// --- Insight ---------------------------------------------------------------
//
// Everything below reads the same rows: one per distance set of a finished
// run, the whole history. The browser does the bucketing, as it does for the
// streak, because the server does not know what day the runner thinks it is.

export interface RunSet {
	workout_id: string;
	started_at: string;
	distance_m: number;
	duration_s: number | null;
	/** 0 | 1 as stored. Warm-up, recoveries and cool-down: miles, not records. */
	is_warmup: number | boolean;
}

interface Run {
	started_at: string;
	distance_m: number;
}

/** A run is a workout: its sets summed, warm-up and all. */
function runs(rows: RunSet[]): Run[] {
	const byWorkout = new Map<string, Run>();
	for (const r of rows) {
		const run = byWorkout.get(r.workout_id);
		if (run) run.distance_m += r.distance_m;
		else byWorkout.set(r.workout_id, { started_at: r.started_at, distance_m: r.distance_m });
	}
	return [...byWorkout.values()];
}

/** Metres per local Monday-start week, keyed by streak.ts's week index. */
function metresByWeek(rows: RunSet[]): Map<number, number> {
	const out = new Map<number, number>();
	for (const r of rows) {
		const d = new Date(r.started_at);
		if (Number.isNaN(d.getTime())) continue;
		const w = weekIndex(localDay(d));
		out.set(w, (out.get(w) ?? 0) + r.distance_m);
	}
	return out;
}

/**
 * Miles per week, oldest first, `weeks` long and zero-filled; the last entry
 * is the week containing `today`. Every row counts: mileage is mileage.
 */
export function weeklyMiles(rows: RunSet[], today: Date, weeks = 12): number[] {
	const byWeek = metresByWeek(rows);
	const thisWeek = weekIndex(localDay(today));
	return Array.from({ length: weeks }, (_, i) => miles(byWeek.get(thisWeek - (weeks - 1 - i)) ?? 0));
}

const SPIKE_WINDOW_MS = 30 * 86_400_000;
const SPIKE_RATIO = 1.1;

/**
 * The per-run guardrail. Not the 10% weekly rule, which the one randomised
 * trial of graded progression did not support: in a 5,205-runner cohort a
 * single run more than 10% past the longest of the previous 30 days was
 * associated with injury, and week-over-week change was not. Observational
 * and distance-only, so it is a line of text, never a block.
 */
export function spikeCap(rows: RunSet[], now: Date): { longest_m: number; cap_m: number } | null {
	const end = now.getTime();
	let longest = 0;
	for (const run of runs(rows)) {
		const t = Date.parse(run.started_at);
		if (Number.isNaN(t) || t > end || t < end - SPIKE_WINDOW_MS) continue;
		if (run.distance_m > longest) longest = run.distance_m;
	}
	return longest > 0 ? { longest_m: longest, cap_m: longest * SPIKE_RATIO } : null;
}

/** One wording, so the stats card and the run form cannot drift. */
export const spikeLine = (cap: { longest_m: number; cap_m: number }): string =>
	`Longest in 30 days is ${miles(cap.longest_m).toFixed(1)}. Past ${miles(cap.cap_m).toFixed(1)} is a spike.`;

export const STANDARD_DISTANCES = [
	{ key: 'mile', label: 'Mile', m: MILE_M },
	{ key: '5k', label: '5K', m: 5000 },
	{ key: '10k', label: '10K', m: 10000 },
	{ key: 'half', label: 'Half', m: 21097.5 },
	{ key: 'marathon', label: 'Marathon', m: 42195 }
] as const;

export interface StandardRecord {
	key: (typeof STANDARD_DISTANCES)[number]['key'];
	label: string;
	/** Time over exactly the standard distance, scaled from the set below. */
	time_s: number;
	/** The real set, always shown beside the scaled time. */
	distance_m: number;
	duration_s: number;
	started_at: string;
}

/**
 * Best time at each standard distance that has one, shortest distance first.
 * A work set counts when it is within −2% / +4% of the distance, which
 * absorbs GPS noise and a watch stopped a few strides late. The time is
 * scaled to the exact distance and the real set rides along: the rule Epley
 * already follows, an estimate never shown without what it came from.
 */
export function standardRecords(rows: RunSet[]): StandardRecord[] {
	const out: StandardRecord[] = [];
	for (const d of STANDARD_DISTANCES) {
		// Integer arithmetic on the bounds, so 4900 m is inside a 5K's band
		// rather than a float's width outside it.
		const lo = (d.m * 98) / 100;
		const hi = (d.m * 104) / 100;
		let best: StandardRecord | null = null;
		for (const r of rows) {
			if (r.is_warmup || !r.duration_s || r.duration_s <= 0) continue;
			if (r.distance_m < lo || r.distance_m > hi) continue;
			const time_s = (r.duration_s * d.m) / r.distance_m;
			if (best === null || time_s < best.time_s) {
				best = {
					key: d.key,
					label: d.label,
					time_s,
					distance_m: r.distance_m,
					duration_s: r.duration_s,
					started_at: r.started_at
				};
			}
		}
		if (best) out.push(best);
	}
	return out;
}

export function longestRun(rows: RunSet[]): Run | null {
	let best: Run | null = null;
	for (const run of runs(rows)) if (best === null || run.distance_m > best.distance_m) best = run;
	return best;
}

/** The local week with the most miles, named by its Monday (YYYY-MM-DD). */
export function biggestWeek(rows: RunSet[]): { miles: number; monday: string } | null {
	let week: number | null = null;
	let most = 0;
	for (const [w, m] of metresByWeek(rows)) {
		if (m > most) {
			most = m;
			week = w;
		}
	}
	if (week === null) return null;
	// The inverse of weekIndex: Monday 5 January 1970 plus whole weeks.
	const monday = new Date(Date.UTC(1970, 0, 5) + week * 7 * 86_400_000).toISOString().slice(0, 10);
	return { miles: miles(most), monday };
}
