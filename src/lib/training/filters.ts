// Filtering axes for the exercise picker. Muscle groups come from volume.ts
// so the picker and the volume table can never disagree about what "back"
// means. Force is the other way people narrow a catalog — "give me pull work" —
// and it is derived, never stored, so nothing new has to be seeded.

import type { Exercise, MovementPattern } from './types.ts';
import { muscleGroup } from './volume.ts';

export type Force = 'push' | 'pull' | 'legs' | 'core';

export const FORCES: Force[] = ['push', 'pull', 'legs', 'core'];

const PATTERN_FORCE: Record<MovementPattern, Force> = {
	horizontal_press: 'push',
	incline_press: 'push',
	vertical_press: 'push',
	chest_fly: 'push',
	lateral_raise: 'push',
	triceps_extension: 'push',
	horizontal_pull: 'pull',
	vertical_pull: 'pull',
	rear_delt: 'pull',
	pullover: 'pull',
	shrug: 'pull',
	biceps_curl: 'pull',
	squat: 'legs',
	hip_hinge: 'legs',
	hip_thrust: 'legs',
	lunge: 'legs',
	leg_curl: 'legs',
	leg_extension: 'legs',
	calf_raise: 'legs',
	ab_flexion: 'core',
	anti_extension: 'core',
	loaded_carry: 'core'
};

const GROUP_FORCE: Record<string, Force> = {
	chest: 'push',
	shoulders: 'push',
	triceps: 'push',
	back: 'pull',
	// Both used to be part of `back` and classified as pull through it. They
	// are their own groups now; the classification does not change.
	traps: 'pull',
	'lower back': 'pull',
	biceps: 'pull',
	quads: 'legs',
	hamstrings: 'legs',
	glutes: 'legs',
	calves: 'legs',
	abs: 'core'
};

type Classifiable = Pick<Exercise, 'movement_pattern' | 'primary_muscles'>;

/**
 * Push/pull/legs/core for any exercise. Patterned exercises answer directly;
 * the ~720 unpatterned ones fall back to the muscle they train, which is how
 * a lifter would classify them anyway.
 */
export function forceCategory(ex: Classifiable): Force | null {
	if (ex.movement_pattern) return PATTERN_FORCE[ex.movement_pattern] ?? null;
	for (const m of ex.primary_muscles) {
		const g = muscleGroup(m);
		if (g && GROUP_FORCE[g]) return GROUP_FORCE[g];
	}
	return null;
}

/** Muscle groups an exercise trains directly. */
export function primaryGroups(ex: Pick<Exercise, 'primary_muscles'>): string[] {
	const out = new Set<string>();
	for (const m of ex.primary_muscles) {
		const g = muscleGroup(m);
		if (g) out.add(g);
	}
	return [...out];
}

/** Muscle groups an exercise assists with. */
export function secondaryGroups(ex: Pick<Exercise, 'secondary_muscles'>): string[] {
	const out = new Set<string>();
	for (const m of ex.secondary_muscles) {
		const g = muscleGroup(m);
		if (g) out.add(g);
	}
	return [...out];
}

export interface ExerciseFilter {
	group?: string | null;
	force?: Force | null;
	equipment?: string | null;
}

export function matchesFilter(
	ex: Pick<Exercise, 'movement_pattern' | 'primary_muscles' | 'equipment'>,
	filter: ExerciseFilter
): boolean {
	if (filter.equipment && ex.equipment !== filter.equipment) return false;
	if (filter.force && forceCategory(ex) !== filter.force) return false;
	// Group filtering is on primary muscles only: "chest" should return chest
	// work, not every press that happens to involve the chest along the way.
	if (filter.group && !primaryGroups(ex).includes(filter.group)) return false;
	return true;
}

export const hasFilter = (f: ExerciseFilter): boolean => !!(f.group || f.force || f.equipment);
