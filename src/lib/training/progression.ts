// Double progression: hit the top of the rep range on every working set,
// add one increment and drop to the bottom. Otherwise keep the load and
// chase reps. Two straight sessions below rep_min on the top set -> suggest
// a deload. Suggestions only — the user always has the last word.

import type { GymConfig, LoggedSet, ProgressionKind } from './types.ts';
import { smallestBarbellJump } from './plates.ts';

export interface Suggestion {
	type: 'start' | 'add_load' | 'add_reps' | 'repeat' | 'deload' | 'beat_time';
	weight_lb?: number;
	target_reps?: number;
	target_duration_s?: number;
	note?: string;
}

/**
 * The smallest realistic jump for a piece of equipment in a given gym.
 * A barbell moves by one small plate per side; a dumbbell moves by the rack
 * step; a stack moves by its pin.
 */
export function incrementFor(
	equipment: string | null,
	gym: GymConfig,
	overrideLb?: number | null
): number {
	if (overrideLb != null && overrideLb > 0) return overrideLb;
	switch (equipment) {
		case 'barbell':
		case 'e-z curl bar':
			return smallestBarbellJump(gym.plates);
		case 'dumbbell':
		case 'kettlebells':
			return gym.dumbbell_step_lb;
		case 'machine':
		case 'cable':
			return gym.machine_step_lb;
		default:
			return 0; // bodyweight and friends: progress by reps
	}
}

const workingSets = (sets: LoggedSet[]) => sets.filter((s) => !s.is_warmup);

/**
 * @param sessions Working-set history for one exercise, newest session first.
 */
export function suggest(
	sessions: LoggedSet[][],
	repMin: number,
	repMax: number,
	kind: ProgressionKind,
	incrementLb: number
): Suggestion | null {
	if (kind === 'none') return null;

	const past = sessions.map(workingSets).filter((s) => s.length > 0);
	if (past.length === 0) {
		return { type: 'start', note: `Find a weight you can move for ${repMin}–${repMax} clean reps.` };
	}
	const last = past[0];

	if (kind === 'time') {
		const best = Math.max(...last.map((s) => s.duration_s ?? 0));
		if (best <= 0) return { type: 'start' };
		const bump = Math.max(5, Math.round(best * 0.1));
		return { type: 'beat_time', target_duration_s: best + bump, note: `Last: ${best}s` };
	}

	// double
	const weights = last.map((s) => s.weight_lb ?? 0);
	const topWeight = Math.max(...weights);
	const reps = last.map((s) => s.reps ?? 0);

	// A big jump (dumbbells, mostly) means we extend the rep range instead of
	// jumping 15%+ and failing. ~10% is the line.
	const bigJump = incrementLb > 0 && topWeight > 0 && incrementLb / topWeight > 0.1;
	const effectiveMax = bigJump ? repMax + 3 : repMax;

	const allAtTop = reps.every((r) => r >= effectiveMax);
	if (allAtTop && incrementLb > 0) {
		return {
			type: 'add_load',
			weight_lb: topWeight + incrementLb,
			target_reps: repMin,
			note: bigJump ? `Earned the jump — ${repMax}+ on everything.` : undefined
		};
	}
	if (allAtTop) {
		// No load to add (bodyweight): keep extending reps.
		return { type: 'add_reps', weight_lb: topWeight || undefined, target_reps: Math.max(...reps) + 1 };
	}

	// Deload check: top set under rep_min two sessions running at the same load.
	if (past.length >= 2) {
		const prev = past[1];
		const prevTop = Math.max(...prev.map((s) => s.weight_lb ?? 0));
		const lastFirst = last[0]?.reps ?? 0;
		const prevFirst = prev[0]?.reps ?? 0;
		if (
			prevTop === topWeight &&
			topWeight > 0 &&
			lastFirst < repMin &&
			prevFirst < repMin
		) {
			return {
				type: 'deload',
				weight_lb: Math.round((topWeight * 0.9) / 5) * 5,
				target_reps: repMin,
				note: 'Two sessions stuck under the range — back off ~10% and rebuild.'
			};
		}
	}

	return {
		type: 'add_reps',
		weight_lb: topWeight || undefined,
		target_reps: Math.min(Math.max(...reps) + 1, effectiveMax),
		note: bigJump ? `Next jump is ${incrementLb} lb (big) — run reps to ${effectiveMax} first.` : undefined
	};
}
