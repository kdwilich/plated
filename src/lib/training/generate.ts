// Split generation: templates are lists of movement-pattern slots; slots are
// filled from the catalog by priority, filtered to the gym's equipment.
// Deterministic, no cleverness. The output is a draft for the editor.

import type { Exercise, MovementPattern, RoutineDraft, SessionDraft } from './types.ts';
import { PROFILES } from './profiles.ts';
import { MAJOR_GROUPS, muscleGroup, weeklySetsByGroup } from './volume.ts';

export type SplitStyle = 'full_body' | 'targeted';

interface Slot {
	pattern: MovementPattern;
	kind: 'compound' | 'isolation';
	optional?: boolean;
}

type Template = { name: string; slots: Slot[] }[];

const c = (pattern: MovementPattern): Slot => ({ pattern, kind: 'compound' });
const iso = (pattern: MovementPattern): Slot => ({ pattern, kind: 'isolation' });
const opt = (s: Slot): Slot => ({ ...s, optional: true });

// Full body: every session trains everything, so each muscle is hit as often
// as you train and a missed day costs a fraction of the week rather than all
// of it. The patterns rotate, so three sessions is not three identical ones.
// The press slot stays chest-dominant, because a session whose only press is
// overhead trains shoulders and calls itself full body. Shoulders get their
// own rotating slot instead.
// Legs get two slots, knee-dominant and hip-dominant, because one rotating
// leg slot cannot feed quads, hamstrings and glutes at once. Only hip_thrust
// is glute-primary in the catalog — squat and lunge file under quads,
// deadlift under lower back — so a single slot left glutes on secondary
// credit alone. The press slot stays chest-dominant for the same reason: a
// session whose only press is overhead trains shoulders and calls itself
// full body. The pull index is offset so sessions do not all rhyme.
const FB_KNEE: MovementPattern[] = ['squat', 'lunge'];
const FB_HIP: MovementPattern[] = ['hip_thrust', 'hip_hinge'];
const FB_PRESS: MovementPattern[] = ['horizontal_press', 'incline_press'];
const FB_PULL: MovementPattern[] = ['horizontal_pull', 'vertical_pull'];
const FB_SHOULDER: Slot[] = [c('vertical_press'), iso('lateral_raise'), iso('rear_delt')];
const FB_ISO: MovementPattern[] = [
	'leg_curl', 'ab_flexion', 'biceps_curl',
	'triceps_extension', 'leg_extension', 'calf_raise', 'chest_fly'
];

function fullBody(days: number): Template {
	return Array.from({ length: days }, (_, n) => ({
		name: `Full body ${String.fromCharCode(65 + n)}`,
		slots: [
			c(FB_KNEE[n % FB_KNEE.length]),
			c(FB_HIP[n % FB_HIP.length]),
			c(FB_PRESS[n % FB_PRESS.length]),
			c(FB_PULL[(n + 1) % FB_PULL.length]),
			FB_SHOULDER[n % FB_SHOULDER.length],
			iso(FB_ISO[(n * 2) % FB_ISO.length]),
			iso(FB_ISO[(n * 2 + 1) % FB_ISO.length])
		]
	}));
}

// Targeted: each session owns a region. Fewer exercises per muscle per
// session, at the cost of training each muscle less often.
const PUSH_A = { name: 'Push', slots: [c('horizontal_press'), c('vertical_press'), c('incline_press'), iso('chest_fly'), iso('lateral_raise'), iso('triceps_extension')] };
const PULL_A = { name: 'Pull', slots: [c('vertical_pull'), c('horizontal_pull'), iso('rear_delt'), iso('biceps_curl'), opt(iso('shrug'))] };
const LEGS_A = { name: 'Legs', slots: [c('squat'), c('hip_hinge'), c('hip_thrust'), iso('leg_curl'), iso('calf_raise'), iso('ab_flexion')] };

const TARGETED: Record<number, Template> = {
	2: [
		{ name: 'Upper', slots: [c('horizontal_press'), c('horizontal_pull'), c('vertical_press'), c('vertical_pull'), iso('lateral_raise'), iso('biceps_curl'), iso('triceps_extension')] },
		{ name: 'Lower', slots: [c('squat'), c('hip_hinge'), c('hip_thrust'), iso('leg_curl'), iso('calf_raise'), iso('ab_flexion')] }
	],
	3: [PUSH_A, PULL_A, LEGS_A],
	4: [
		{ name: 'Upper A', slots: [c('horizontal_press'), c('horizontal_pull'), c('vertical_press'), c('vertical_pull'), iso('biceps_curl'), iso('triceps_extension')] },
		{ name: 'Lower A', slots: [c('squat'), iso('leg_curl'), c('hip_thrust'), iso('calf_raise'), iso('ab_flexion')] },
		{ name: 'Upper B', slots: [c('incline_press'), c('horizontal_pull'), iso('lateral_raise'), iso('chest_fly'), iso('rear_delt'), iso('biceps_curl')] },
		{ name: 'Lower B', slots: [c('hip_hinge'), c('lunge'), iso('leg_extension'), iso('calf_raise'), iso('ab_flexion')] }
	],
	5: [
		PUSH_A,
		PULL_A,
		LEGS_A,
		{ name: 'Upper', slots: [c('incline_press'), c('horizontal_pull'), c('vertical_pull'), iso('lateral_raise'), iso('rear_delt'), iso('biceps_curl')] },
		{ name: 'Lower', slots: [c('hip_thrust'), iso('leg_extension'), iso('leg_curl'), iso('calf_raise'), iso('ab_flexion')] }
	],
	6: [
		{ name: 'Push A', slots: [c('horizontal_press'), c('vertical_press'), iso('chest_fly'), iso('triceps_extension'), iso('lateral_raise')] },
		{ name: 'Pull A', slots: [c('vertical_pull'), c('horizontal_pull'), iso('rear_delt'), iso('biceps_curl'), opt(iso('shrug'))] },
		{ name: 'Legs A', slots: [c('squat'), iso('leg_curl'), c('lunge'), iso('calf_raise'), iso('ab_flexion')] },
		{ name: 'Push B', slots: [c('vertical_press'), c('incline_press'), iso('chest_fly'), iso('triceps_extension'), iso('lateral_raise')] },
		{ name: 'Pull B', slots: [c('horizontal_pull'), c('vertical_pull'), opt(iso('pullover')), iso('biceps_curl'), iso('rear_delt')] },
		{ name: 'Legs B', slots: [c('hip_hinge'), iso('leg_extension'), c('hip_thrust'), iso('calf_raise'), iso('ab_flexion')] }
	]
};

/**
 * Below 4 days a targeted split trains each muscle roughly once a week, and
 * one missed session wipes that muscle out entirely — so full body is the
 * better default there. At 4+ a targeted split still gets everything twice.
 */
export function defaultSplitStyle(daysPerWeek: number): SplitStyle {
	return daysPerWeek <= 3 ? 'full_body' : 'targeted';
}

function templateFor(days: number, style: SplitStyle): Template {
	if (style === 'full_body') return fullBody(days);
	return TARGETED[days] ?? TARGETED[3];
}

export interface GenerateInput {
	daysPerWeek: 2 | 3 | 4 | 5 | 6;
	equipment: string[];
	profileKey: string;
	/** Defaults by day count — see defaultSplitStyle(). */
	splitStyle?: SplitStyle;
	/** Generator-eligible catalog: every entry must have a movement_pattern. */
	catalog: Exercise[];
}

export function generate(input: GenerateInput): RoutineDraft {
	const profile = PROFILES[input.profileKey] ?? PROFILES.hypertrophy;
	const style = input.splitStyle ?? defaultSplitStyle(input.daysPerWeek);
	const template = templateFor(input.daysPerWeek, style);
	const equipment = new Set(input.equipment);
	const warnings: string[] = [];
	const usedIds = new Set<string>();

	if (style === 'targeted' && input.daysPerWeek <= 3) {
		warnings.push(
			`A ${input.daysPerWeek}-day targeted split trains each muscle about once a week, so a missed session costs that muscle the whole week. Full body spreads the same volume across every session.`
		);
	}

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

	// The pass above can only add sets to an exercise that trains the group
	// directly. A group with no direct work at all is invisible to it, so it
	// would sit under target forever without anyone being told.
	const finalVolume = weeklySetsByGroup(draft);
	for (const group of MAJOR_GROUPS) {
		const direct = all.some((pe) =>
			pe.exercise.primary_muscles.some((m) => muscleGroup(m) === group)
		);
		if (direct) continue;
		const indirect = finalVolume[group] ?? 0;
		warnings.push(
			indirect > 0
				? `${group} only gets indirect work (${indirect} sets). Add a ${group} exercise if you want it trained directly.`
				: `Nothing in this routine trains ${group}.`
		);
	}

	return draft;
}
