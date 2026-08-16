// Split generation: templates are lists of movement-pattern slots; slots are
// filled from the catalog by priority, filtered to the gym's equipment.
// Deterministic, no cleverness. The output is a draft for the editor.

import type { Exercise, MovementPattern, RoutineDraft, SessionDraft } from './types.ts';
import { PROFILES } from './profiles.ts';
import { muscleGroup, weeklySetsByGroup } from './volume.ts';

interface Slot {
	pattern: MovementPattern;
	kind: 'compound' | 'isolation';
	optional?: boolean;
}

type Template = { name: string; slots: Slot[] }[];

const c = (pattern: MovementPattern): Slot => ({ pattern, kind: 'compound' });
const i = (pattern: MovementPattern): Slot => ({ pattern, kind: 'isolation' });
const opt = (s: Slot): Slot => ({ ...s, optional: true });

const TEMPLATES: Record<number, Template> = {
	2: [
		{ name: 'Full body A', slots: [c('squat'), c('horizontal_press'), c('horizontal_pull'), i('leg_curl'), i('lateral_raise'), i('ab_flexion')] },
		{ name: 'Full body B', slots: [c('hip_hinge'), c('vertical_press'), c('vertical_pull'), i('leg_extension'), i('biceps_curl'), i('triceps_extension')] }
	],
	3: [
		{ name: 'Full body A', slots: [c('squat'), c('horizontal_press'), c('horizontal_pull'), i('leg_curl'), i('lateral_raise'), i('ab_flexion')] },
		{ name: 'Full body B', slots: [c('hip_hinge'), c('vertical_press'), c('vertical_pull'), i('leg_extension'), i('biceps_curl'), i('triceps_extension')] },
		{ name: 'Full body C', slots: [c('lunge'), c('incline_press'), c('horizontal_pull'), c('hip_thrust'), i('chest_fly'), i('calf_raise')] }
	],
	4: [
		{ name: 'Upper A', slots: [c('horizontal_press'), c('horizontal_pull'), c('vertical_press'), c('vertical_pull'), i('biceps_curl'), i('triceps_extension')] },
		{ name: 'Lower A', slots: [c('squat'), i('leg_curl'), c('hip_thrust'), i('calf_raise'), i('ab_flexion')] },
		{ name: 'Upper B', slots: [c('incline_press'), c('horizontal_pull'), i('lateral_raise'), i('chest_fly'), i('rear_delt'), i('biceps_curl')] },
		{ name: 'Lower B', slots: [c('hip_hinge'), c('lunge'), i('leg_extension'), i('calf_raise'), i('ab_flexion')] }
	],
	5: pplTwice(),
	6: pplTwice()
};

function pplTwice(): Template {
	return [
		{ name: 'Push A', slots: [c('horizontal_press'), c('vertical_press'), i('chest_fly'), i('triceps_extension'), i('lateral_raise')] },
		{ name: 'Pull A', slots: [c('vertical_pull'), c('horizontal_pull'), i('rear_delt'), i('biceps_curl'), opt(i('shrug'))] },
		{ name: 'Legs A', slots: [c('squat'), i('leg_curl'), c('lunge'), i('calf_raise'), i('ab_flexion')] },
		{ name: 'Push B', slots: [c('vertical_press'), c('incline_press'), i('chest_fly'), i('triceps_extension'), i('lateral_raise')] },
		{ name: 'Pull B', slots: [c('horizontal_pull'), c('vertical_pull'), opt(i('pullover')), i('biceps_curl'), i('rear_delt')] },
		{ name: 'Legs B', slots: [c('hip_hinge'), i('leg_extension'), c('hip_thrust'), i('calf_raise'), i('ab_flexion')] }
	];
}

export interface GenerateInput {
	daysPerWeek: 2 | 3 | 4 | 5 | 6;
	equipment: string[];
	profileKey: string;
	/** Generator-eligible catalog: every entry must have a movement_pattern. */
	catalog: Exercise[];
}

export function generate(input: GenerateInput): RoutineDraft {
	const profile = PROFILES[input.profileKey] ?? PROFILES.hypertrophy;
	const template = TEMPLATES[input.daysPerWeek] ?? TEMPLATES[3];
	const equipment = new Set(input.equipment);
	const warnings: string[] = [];
	const usedIds = new Set<string>();

	// The structural guard: nothing without a pattern can ever be picked,
	// because candidates are keyed BY pattern.
	const byPattern = new Map<MovementPattern, Exercise[]>();
	for (const e of input.catalog) {
		if (!e.movement_pattern) continue;
		if (e.equipment && !equipment.has(e.equipment)) continue;
		const list = byPattern.get(e.movement_pattern) ?? [];
		list.push(e);
		byPattern.set(e.movement_pattern, list);
	}
	for (const list of byPattern.values()) list.sort((a, b) => b.priority - a.priority);

	const sessions: SessionDraft[] = [];
	for (const t of template) {
		const session: SessionDraft = { name: t.name, exercises: [] };
		for (const slot of t.slots) {
			const candidates = byPattern.get(slot.pattern) ?? [];
			const pick =
				candidates.find((e) => !usedIds.has(e.id)) ??
				(slot.optional ? undefined : candidates[0]);
			if (!pick) {
				if (!slot.optional) {
					warnings.push(`No ${slot.pattern.replace('_', ' ')} available for "${t.name}" with your equipment.`);
				}
				continue;
			}
			usedIds.add(pick.id);
			const rx = profile[slot.kind];
			session.exercises.push({
				exercise: pick,
				target_sets: rx.sets,
				rep_min: rx.rep_min,
				rep_max: rx.rep_max,
				rir_target: profile.rir
			});
		}
		sessions.push(session);
	}

	const draft: RoutineDraft = { profile_key: profile.key, sessions, warnings };

	// Volume pass: groups with direct work but below the profile's weekly
	// minimum get extra sets, up to a per-exercise cap. Groups nothing
	// targets already produced a slot warning above.
	const cap = Math.max(profile.compound.sets, profile.isolation.sets) + 2;
	const all = draft.sessions.flatMap((s) => s.exercises);
	for (let iter = 0; iter < 60; iter++) {
		const vol = weeklySetsByGroup(draft);
		const pick = all.find(
			(pe) =>
				pe.target_sets < cap &&
				pe.exercise.primary_muscles.some((m) => {
					const g = muscleGroup(m);
					return g !== null && (vol[g] ?? 0) < profile.weekly_sets_min;
				})
		);
		if (!pick) break;
		pick.target_sets += 1;
	}

	return draft;
}
