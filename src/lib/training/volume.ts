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
			for (const m of exercise.primary_muscles) {
				const g = muscleGroup(m);
				if (g) out[g] = (out[g] ?? 0) + target_sets;
			}
			for (const m of exercise.secondary_muscles) {
				const g = muscleGroup(m);
				if (g) out[g] = (out[g] ?? 0) + target_sets * 0.5;
			}
		}
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
