// Two recommendation questions, both answered by ranking the catalog:
//
//   "the machine is taken, what else?"  -> rankAlternatives
//   "what else belongs in this day?"    -> rankComplements
//
// Deterministic and pure, like the generator. Ranking is the only thing here
// that could quietly be wrong, so it is a function of its arguments and
// nothing else.

import type { Exercise, Measurement } from './types.ts';
import { forceCategory, primaryGroups, secondaryGroups } from './filters.ts';

export interface RankOptions {
	/** The gym's equipment keys. Empty means "don't know" — no penalty. */
	equipment?: string[];
	exclude?: string[];
	limit?: number;
}

interface Ranked<T> {
	exercise: T;
	score: number;
	available: boolean;
}

const repBased = (m: Measurement) => m === 'load_reps' || m === 'reps_only';

/**
 * Availability is a partition, not a score term. A perfect pattern match on a
 * machine the gym does not own is not a better answer than a decent match you
 * can actually walk over and do — but the gym list can be incomplete, so
 * unavailable options are demoted rather than hidden.
 */
const inGym = (candidate: Exercise, gym: string[]): boolean =>
	gym.length === 0 || (!!candidate.equipment && gym.includes(candidate.equipment));

/**
 * Substitutes for one exercise, best first.
 *
 * The measurement gate is a hard one, the same trick the generator uses with
 * a NULL movement pattern: a squat and a one-mile run share "quadriceps", so
 * without it the app would offer cardio as a substitute for a leg press.
 */
export function rankAlternatives(
	target: Exercise,
	catalog: Exercise[],
	options: RankOptions = {}
): Exercise[] {
	const gym = options.equipment ?? [];
	const skip = new Set([target.id, ...(options.exclude ?? [])]);
	const targetGroups = new Set(primaryGroups(target));
	const targetForce = forceCategory(target);

	const ranked: Ranked<Exercise>[] = [];
	for (const candidate of catalog) {
		if (skip.has(candidate.id)) continue;
		if (repBased(candidate.measurement) !== repBased(target.measurement)) continue;

		const shared = primaryGroups(candidate).filter((g) => targetGroups.has(g));
		const samePattern =
			!!target.movement_pattern && candidate.movement_pattern === target.movement_pattern;
		// Trains something else entirely — not a substitute, whatever it scores.
		if (!samePattern && shared.length === 0) continue;

		let score = 0;
		if (samePattern) score += 100;
		score += shared.length * 30;
		if (targetForce && forceCategory(candidate) === targetForce) score += 10;
		// You are usually swapping *because* the implement is unavailable, so a
		// different one is a feature rather than a compromise.
		if (candidate.equipment !== target.equipment) score += 6;
		score += candidate.priority * 0.1;
		ranked.push({ exercise: candidate, score, available: inGym(candidate, gym) });
	}

	return top(ranked, options.limit ?? 12);
}

/**
 * More work that belongs in a session, weighted toward whatever that session
 * covers least.
 *
 * Scoped to the groups the session is about: on a push day this offers the
 * triceps work you skipped, never leg curls. An empty session yields nothing,
 * which is the right answer for a freestyle workout that has not started —
 * there is no "day" to reason about yet.
 */
export function rankComplements(
	current: Exercise[],
	catalog: Exercise[],
	options: RankOptions = {}
): Exercise[] {
	const gym = options.equipment ?? [];
	const skip = new Set([...current.map((e) => e.id), ...(options.exclude ?? [])]);

	// How many exercises already train each group directly. Set counts would be
	// more precise, but the mid-workout caller only knows what is on screen,
	// and "you have two chest movements and no triceps" is the signal that
	// matters either way.
	const covered: Record<string, number> = {};
	const assisted: Record<string, number> = {};
	for (const ex of current) {
		for (const g of primaryGroups(ex)) covered[g] = (covered[g] ?? 0) + 1;
		for (const g of secondaryGroups(ex)) assisted[g] = (assisted[g] ?? 0) + 1;
	}

	// A group belongs to the day if something trains it directly, or if it
	// assists across most of the session. That second clause is what earns
	// triceps a place on a bench day — but it has to be *most*: a barbell squat
	// lists "lower back" as a secondary, and without the threshold a leg day
	// would recommend deadlifts and rows on the grounds that back is starved.
	const assistFloor = Math.max(2, Math.ceil(current.length / 2));
	const inScope = new Set([
		...Object.keys(covered),
		...Object.keys(assisted).filter((g) => assisted[g] >= assistFloor)
	]);
	if (inScope.size === 0) return [];

	const forceCount: Record<string, number> = {};
	for (const ex of current) {
		const f = forceCategory(ex);
		if (f) forceCount[f] = (forceCount[f] ?? 0) + 1;
	}
	const dominant = Object.entries(forceCount).sort((a, b) => b[1] - a[1])[0]?.[0];

	const ranked: Ranked<Exercise>[] = [];
	for (const candidate of catalog) {
		if (skip.has(candidate.id)) continue;
		// Generator-grade only. Nothing recommends a mile run into leg day.
		if (!candidate.movement_pattern) continue;

		const groups = primaryGroups(candidate).filter((g) => inScope.has(g));
		if (groups.length === 0) continue;

		let score = 0;
		for (const g of groups) score += 40 / (1 + (covered[g] ?? 0));
		if (dominant && forceCategory(candidate) === dominant) score += 15;
		score += candidate.priority * 0.1;
		ranked.push({ exercise: candidate, score, available: inGym(candidate, gym) });
	}

	return top(ranked, options.limit ?? 12);
}

function top<T extends Exercise>(ranked: Ranked<T>[], limit: number): T[] {
	return ranked
		.sort(
			(a, b) =>
				Number(b.available) - Number(a.available) ||
				b.score - a.score ||
				a.exercise.name.localeCompare(b.exercise.name)
		)
		.slice(0, limit)
		.map((r) => r.exercise);
}
