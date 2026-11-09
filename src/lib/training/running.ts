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
