// Weekly volume accounting and muscle staleness. There is no calendar:
// a routine is a rotation, and "next" is whatever follows the last thing done.

import type { RoutineDraft, SessionDraft } from './types.ts';

// Collapse the dataset's 17 muscles into the groups a lifter thinks in.
const GROUP: Record<string, string> = {
	chest: 'chest',
	lats: 'back',
	'middle back': 'back',
	'lower back': 'back',
	traps: 'back',
	shoulders: 'shoulders',
	biceps: 'biceps',
	forearms: 'biceps',
	triceps: 'triceps',
	quadriceps: 'quads',
	hamstrings: 'hamstrings',
	glutes: 'glutes',
	adductors: 'quads',
	abductors: 'glutes',
	calves: 'calves',
	abdominals: 'abs',
	neck: 'back'
};

export function muscleGroup(muscle: string): string | null {
	return GROUP[muscle] ?? null;
}

/** The dataset muscles a group is made of — lets SQL narrow before JS filters. */
export function musclesInGroup(group: string): string[] {
	return Object.keys(GROUP).filter((m) => GROUP[m] === group);
}

/** Every group a complete routine should train directly. */
export const MAJOR_GROUPS = [
	'chest',
	'back',
	'shoulders',
	'quads',
	'hamstrings',
	'glutes',
	'biceps',
	'triceps',
	'calves',
	'abs'
] as const;

/**
 * One exercise's credit, applied once per group. A group is worth a full set
 * if any primary muscle lands there and half a set if only secondaries do —
 * never both, and never once per muscle.
 *
 * Paying per muscle looked harmless until you notice how many of the dataset's
 * muscles share a group. A deadlift is `lower back` primary with `lats`,
 * `middle back` and `traps` secondary: four muscles, one group, 2.5× credit
 * per set. Every row paid 1.5×, every curl paid 1.5× on `forearms`. Back could
 * not help but look covered.
 */
function creditExercise(
	out: Record<string, number>,
	primary: string[],
	secondary: string[],
	sets: number
): void {
	const primaryGroups = new Set<string>();
	for (const m of primary) {
		const g = muscleGroup(m);
		if (g) primaryGroups.add(g);
	}
	for (const g of primaryGroups) out[g] = (out[g] ?? 0) + sets;

	const secondaryGroups = new Set<string>();
	for (const m of secondary) {
		const g = muscleGroup(m);
		if (g && !primaryGroups.has(g)) secondaryGroups.add(g);
	}
	for (const g of secondaryGroups) out[g] = (out[g] ?? 0) + sets * 0.5;
}

/**
 * Weekly sets per muscle group across a full pass of the rotation.
 * Primary muscles count full; secondaries count half — a bench press is
 * real triceps work and pretending otherwise misleads the volume table.
 */
export function weeklySetsByGroup(draft: RoutineDraft): Record<string, number> {
	const out: Record<string, number> = {};
	for (const session of draft.sessions) {
		for (const { exercise, target_sets } of session.exercises) {
			// Cardio and unpatterned oddities never count toward volume.
			if (!exercise.movement_pattern) continue;
			creditExercise(out, exercise.primary_muscles, exercise.secondary_muscles, target_sets);
		}
	}
	for (const g of Object.keys(out)) out[g] = Math.round(out[g] * 2) / 2;
	return out;
}

/** One exercise's contribution to a window of real training. */
export interface TrainedExercise {
	primary_muscles: string[];
	secondary_muscles: string[];
	movement_pattern: string | null;
	sets: number;
}

/**
 * Sets per muscle group from what was actually logged — the counterpart to
 * weeklySetsByGroup, which scores the plan. The scoring rules are deliberately
 * identical so the two can be shown side by side, which is the only way the app
 * can say a group is under-*trained* rather than merely under-planned.
 */
export function actualSetsByGroup(trained: TrainedExercise[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const t of trained) {
		if (!t.movement_pattern) continue;
		creditExercise(out, t.primary_muscles, t.secondary_muscles, t.sets);
	}
	for (const g of Object.keys(out)) out[g] = Math.round(out[g] * 2) / 2;
	return out;
}

export function groupsForSession(session: SessionDraft): string[] {
	const set = new Set<string>();
	for (const { exercise } of session.exercises) {
		if (!exercise.movement_pattern) continue;
		for (const m of exercise.primary_muscles) {
			const g = muscleGroup(m);
			if (g) set.add(g);
		}
	}
	return [...set];
}

/**
 * Days since each muscle group was last trained, from (group, completed_at)
 * pairs of past working sets. Groups never trained are absent.
 */
export function stalenessByGroup(
	trained: { group: string; completed_at: string }[],
	now: Date
): Record<string, number> {
	const latest: Record<string, number> = {};
	for (const { group, completed_at } of trained) {
		const t = Date.parse(completed_at);
		if (!Number.isFinite(t)) continue;
		if (latest[group] === undefined || t > latest[group]) latest[group] = t;
	}
	const out: Record<string, number> = {};
	for (const [g, t] of Object.entries(latest)) {
		out[g] = Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
	}
	return out;
}

/** Next session in the rotation, cyclic; null history starts at the top. */
export function nextPosition(sessionCount: number, lastPosition: number | null): number {
	if (sessionCount <= 0) return 0;
	if (lastPosition === null) return 0;
	return (lastPosition + 1) % sessionCount;
}
