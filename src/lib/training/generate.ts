// Split generation: templates are lists of movement-pattern slots; slots are
// filled from the catalog by priority, filtered to the gym's equipment.
// Deterministic, no cleverness. The output is a draft for the editor.

import type {
	Exercise,
	MovementPattern,
	PrescribedExercise,
	RoutineDraft,
	SessionDraft
} from './types.ts';
import { PROFILES } from './profiles.ts';
import { MAJOR_GROUPS, creditFor, muscleGroup, volumeWarnings, weeklySetsByGroup } from './volume.ts';
import { primaryGroups, secondaryGroups, type Force } from './filters.ts';

export type SplitStyle = 'full_body' | 'targeted';
export type Emphasis = 'balanced' | 'lower' | 'upper';

interface Slot {
	pattern: MovementPattern;
	kind: 'compound' | 'isolation';
	optional?: boolean;
}

/**
 * `forces` is what the session is *for* — the thing that makes a session named
 * "Pull" mean something. Absent means unconstrained, which is the honest answer
 * for a full body day. Emphasis reads it before adding anything, because
 * without it "upper" was broad enough to justify a curl on push day.
 */
type Template = { name: string; forces?: Force[]; slots: Slot[] }[];

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
const PUSH_A = { name: 'Push', forces: ['push'] as Force[], slots: [c('horizontal_press'), c('vertical_press'), c('incline_press'), iso('chest_fly'), iso('lateral_raise'), iso('triceps_extension')] };
const PULL_A = { name: 'Pull', forces: ['pull'] as Force[], slots: [c('vertical_pull'), c('horizontal_pull'), iso('rear_delt'), iso('biceps_curl'), opt(iso('shrug'))] };
// Every leg day carries two knee-dominant movements. One squat against a
// hinge, a thrust and a curl left quads on 4 sets a week while hamstrings
// and glutes got three slots between them.
const LEGS_A = { name: 'Legs', forces: ['legs'] as Force[], slots: [c('squat'), c('hip_hinge'), c('hip_thrust'), iso('leg_extension'), iso('leg_curl'), iso('calf_raise'), iso('ab_flexion')] };

const TARGETED: Record<number, Template> = {
	2: [
		{ name: 'Upper', forces: ['push', 'pull'] as Force[], slots: [c('horizontal_press'), c('horizontal_pull'), c('vertical_press'), c('vertical_pull'), iso('lateral_raise'), iso('biceps_curl'), iso('triceps_extension')] },
		{ name: 'Lower', forces: ['legs'] as Force[], slots: [c('squat'), c('hip_hinge'), c('hip_thrust'), iso('leg_extension'), iso('leg_curl'), iso('calf_raise'), iso('ab_flexion')] }
	],
	3: [PUSH_A, PULL_A, LEGS_A],
	4: [
		{ name: 'Upper A', forces: ['push', 'pull'] as Force[], slots: [c('horizontal_press'), c('horizontal_pull'), c('vertical_press'), c('vertical_pull'), iso('biceps_curl'), iso('triceps_extension')] },
		{ name: 'Lower A', forces: ['legs'] as Force[], slots: [c('squat'), iso('leg_curl'), c('hip_thrust'), iso('calf_raise'), iso('ab_flexion')] },
		{ name: 'Upper B', forces: ['push', 'pull'] as Force[], slots: [c('incline_press'), c('horizontal_pull'), iso('lateral_raise'), iso('chest_fly'), iso('rear_delt'), iso('biceps_curl')] },
		{ name: 'Lower B', forces: ['legs'] as Force[], slots: [c('hip_hinge'), c('lunge'), iso('leg_extension'), iso('calf_raise'), iso('ab_flexion')] }
	],
	5: [
		PUSH_A,
		PULL_A,
		LEGS_A,
		{ name: 'Upper', forces: ['push', 'pull'] as Force[], slots: [c('incline_press'), c('horizontal_pull'), c('vertical_pull'), iso('lateral_raise'), iso('rear_delt'), iso('biceps_curl')] },
		{ name: 'Lower', forces: ['legs'] as Force[], slots: [c('lunge'), c('hip_thrust'), iso('leg_extension'), iso('leg_curl'), iso('calf_raise'), iso('ab_flexion')] }
	],
	6: [
		{ name: 'Push A', forces: ['push'] as Force[], slots: [c('horizontal_press'), c('vertical_press'), iso('chest_fly'), iso('triceps_extension'), iso('lateral_raise')] },
		{ name: 'Pull A', forces: ['pull'] as Force[], slots: [c('vertical_pull'), c('horizontal_pull'), iso('rear_delt'), iso('biceps_curl'), opt(iso('shrug'))] },
		{ name: 'Legs A', forces: ['legs'] as Force[], slots: [c('squat'), iso('leg_curl'), c('lunge'), iso('calf_raise'), iso('ab_flexion')] },
		{ name: 'Push B', forces: ['push'] as Force[], slots: [c('vertical_press'), c('incline_press'), iso('chest_fly'), iso('triceps_extension'), iso('lateral_raise')] },
		{ name: 'Pull B', forces: ['pull'] as Force[], slots: [c('horizontal_pull'), c('vertical_pull'), opt(iso('pullover')), iso('biceps_curl'), iso('rear_delt')] },
		{ name: 'Legs B', forces: ['legs'] as Force[], slots: [c('hip_hinge'), iso('leg_extension'), c('hip_thrust'), iso('calf_raise'), iso('ab_flexion')] }
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

// ---------------------------------------------------------------------------
// Physique emphasis. Not a demographic guess — an explicit statement of what
// you want more of. The emphasized region gains an exercise slot per session
// (where one fits) and a higher weekly volume target; the other region drops
// up to one isolation per session, only while it stays at maintenance volume.
// Compounds are never removed: de-emphasis means maintenance, not neglect.

const LOWER_PATTERNS = new Set<MovementPattern>([
	'squat', 'hip_hinge', 'hip_thrust', 'lunge', 'leg_curl', 'leg_extension', 'calf_raise'
]);
const CORE_PATTERNS = new Set<MovementPattern>(['ab_flexion', 'anti_extension', 'loaded_carry']);

function slotRegion(pattern: MovementPattern): 'lower' | 'upper' | 'core' {
	if (LOWER_PATTERNS.has(pattern)) return 'lower';
	if (CORE_PATTERNS.has(pattern)) return 'core';
	return 'upper';
}

export const LOWER_GROUPS = new Set(['quads', 'hamstrings', 'glutes', 'calves']);
export const UPPER_GROUPS = new Set(['chest', 'back', 'shoulders', 'biceps', 'triceps']);

// What emphasis may add, keyed by the force it belongs to rather than by
// region. "Upper" covers both halves of a push/pull split, which is exactly
// why a region-keyed pool put a curl on push day: biceps are upper, and that
// was the only question being asked.
const EXTRAS_BY_FORCE: Record<Force, Slot[]> = {
	push: [iso('chest_fly'), iso('lateral_raise'), iso('triceps_extension'), c('incline_press')],
	pull: [iso('biceps_curl'), iso('rear_delt'), c('horizontal_pull'), iso('shrug')],
	legs: [c('hip_thrust'), iso('leg_curl'), iso('leg_extension'), c('lunge'), iso('calf_raise')],
	core: []
};

const EMPHASIS_FORCES: Record<Exclude<Emphasis, 'balanced'>, Force[]> = {
	upper: ['push', 'pull'],
	lower: ['legs']
};

// Which muscle group a slot is direct work FOR, so de-emphasis can cut the
// accessory whose muscle keeps direct work elsewhere in the week, instead of
// blindly zeroing whatever iso happens to sit last.
const PATTERN_GROUP: Record<MovementPattern, string> = {
	horizontal_press: 'chest',
	incline_press: 'chest',
	chest_fly: 'chest',
	vertical_press: 'shoulders',
	lateral_raise: 'shoulders',
	rear_delt: 'shoulders',
	horizontal_pull: 'back',
	vertical_pull: 'back',
	shrug: 'back',
	pullover: 'back',
	biceps_curl: 'biceps',
	triceps_extension: 'triceps',
	squat: 'quads',
	lunge: 'quads',
	leg_extension: 'quads',
	hip_hinge: 'hamstrings',
	leg_curl: 'hamstrings',
	hip_thrust: 'glutes',
	calf_raise: 'calves',
	ab_flexion: 'abs',
	anti_extension: 'abs',
	loaded_carry: 'abs'
};

function applyEmphasis(template: Template, emphasis: Emphasis): Template {
	if (emphasis === 'balanced') return template;

	return template.map((t, n) => {
		const slots = [...t.slots];

		// Add an emphasized slot the session doesn't already have, drawn only
		// from the forces this session is actually for. A pull day gains pull
		// work or nothing — never a lateral raise next to the face pull that
		// already covers its rear delts, and never a leg press.
		const allowed = t.forces ?? (['push', 'pull', 'legs'] as Force[]);
		const extras = EMPHASIS_FORCES[emphasis]
			.filter((f) => allowed.includes(f))
			.flatMap((f) => EXTRAS_BY_FORCE[f]);
		if (extras.length > 0) {
			const present = new Set(slots.map((s) => s.pattern));
			for (let k = 0; k < extras.length; k++) {
				const candidate = extras[(n + k) % extras.length];
				if (!present.has(candidate.pattern)) {
					slots.push(candidate);
					break;
				}
			}
		}

		return { name: t.name, forces: t.forces, slots };
	});
}

/**
 * The most direct sets one muscle group usefully takes in a single session.
 * Weekly volume is the thing that drives growth, but it has to be delivered in
 * doses — fourteen sets of chest in one afternoon is not the same stimulus as
 * fourteen spread over two days, and the back half of that session is fatigue
 * with nothing to show for it.
 */
const MAX_DIRECT_SETS_PER_SESSION = 10;

const sessionSets = (s: SessionDraft): number =>
	s.exercises.reduce((total, pe) => total + pe.target_sets, 0);

const directSetsInSession = (s: SessionDraft, group: string): number =>
	s.exercises.reduce(
		(total, pe) => (primaryGroups(pe.exercise).includes(group) ? total + pe.target_sets : total),
		0
	);

/**
 * Priority order, adjusted for what the session already holds.
 *
 * The one adjustment so far: a hinge that follows a squat should be the one
 * that trains hamstrings. Barbell Deadlift outranks Romanian Deadlift 100 to
 * 96, so leg day led with a squat and followed it with the heaviest pull in
 * the catalog — two maximal axial loads in one session, and still nothing
 * hamstring-primary, because a conventional deadlift is `lower back` primary.
 * Where the hinge is the session's only heavy compound, the deadlift keeps the
 * slot.
 *
 * "Squats in this session" reads the template, not what has been picked so
 * far: the 4-day Lower B opens with its hinge and lunges after, so checking
 * only earlier picks handed it a conventional deadlift every time and left
 * the split with no hamstring hip extension at all.
 */
function rankCandidates(
	candidates: Exercise[],
	slot: Slot,
	sessionSlots: Slot[],
	fillable: (p: MovementPattern) => boolean
): Exercise[] {
	if (slot.pattern !== 'hip_hinge') return candidates;
	const squats = sessionSlots.some((s) => (s.pattern === 'squat' || s.pattern === 'lunge') && fillable(s.pattern));
	if (!squats) return candidates;
	const hamstrings = candidates.filter((e) => primaryGroups(e).includes('hamstrings'));
	if (hamstrings.length === 0) return candidates;
	return [...hamstrings, ...candidates.filter((e) => !hamstrings.includes(e))];
}

/**
 * A filled slot, still carrying what the template knew about it. The kind and
 * region are gone from the draft itself — a PrescribedExercise is just an
 * exercise and a prescription — but de-emphasis and the volume pass both need
 * to tell a compound from an accessory.
 */
interface Picked {
	session: SessionDraft;
	pe: PrescribedExercise;
	kind: 'compound' | 'isolation';
	region: 'lower' | 'upper' | 'core';
}

/**
 * De-emphasis: drop one accessory per session from the region you asked for
 * less of. Compounds are never touched — de-emphasis means maintenance, not
 * neglect — and neither is the last direct exercise a muscle group has.
 *
 * This runs on picked exercises rather than on template slots, because a slot
 * does not know what it will become. The old pass cut against a static
 * pattern→group map claiming `hip_hinge` meant hamstrings; the catalog's
 * top-priority hinge is a conventional deadlift, which is `lower back`
 * primary. So it removed leg curls believing the hinge still covered
 * hamstrings, and six configurations shipped with no hamstring work at all.
 */
function trimDeEmphasized(picked: Picked[], emphasis: Emphasis, maintenance: number): Picked[] {
	if (emphasis === 'balanced') return picked;
	const opposite = emphasis === 'lower' ? 'upper' : 'lower';
	const owed = new Set<string>(MAJOR_GROUPS);

	// Direct exercises and direct sets per group, from what was actually
	// picked. Counting exercises alone let a group with two of them lose one
	// and land at 4 sets against a 6-set maintenance promise. Sets are
	// credited the way the weekly table counts them (secondary at half), so
	// the trim keeps exactly the promise the page shows, and no stricter one.
	const direct = new Map<string, number>();
	const sets = new Map<string, number>();
	const credit = (p: Picked) => Object.entries(creditFor(p.pe.exercise, p.pe.target_sets));
	for (const p of picked) {
		for (const g of primaryGroups(p.pe.exercise)) direct.set(g, (direct.get(g) ?? 0) + 1);
		for (const [g, n] of credit(p)) sets.set(g, (sets.get(g) ?? 0) + n);
	}

	const dropped = new Set<PrescribedExercise>();
	for (const session of [...new Set(picked.map((p) => p.session))]) {
		let best: Picked | null = null;
		let bestRedundancy = -1;
		for (const p of picked) {
			if (p.session !== session || p.kind !== 'isolation' || p.region !== opposite) continue;
			const groups = primaryGroups(p.pe.exercise);
			if (groups.length === 0) continue;
			// Cutting may not take a group the routine owes direct work down to
			// zero, however redundant the rest of the week looks.
			if (!groups.every((g) => !owed.has(g) || (direct.get(g) ?? 0) > 1)) continue;
			// Nor take any group it credits, primary or secondary, below the
			// maintenance dose the emphasis option promises. A rear-delt row is
			// shoulders primary but half a set of back, and back can be the one
			// sitting on the line.
			if (credit(p).some(([g, n]) => owed.has(g) && (sets.get(g) ?? 0) - n < maintenance)) continue;
			// An accessory for a group the routine owes nothing (a shrug) goes
			// before one that is a group's only direct work of its kind (a face
			// pull being the week's rear delts).
			const redundancy = groups.some((g) => owed.has(g))
				? Math.min(...groups.map((g) => direct.get(g) ?? 0))
				: Infinity;
			if (redundancy > bestRedundancy) {
				bestRedundancy = redundancy;
				best = p;
			}
		}
		if (!best) continue;
		for (const g of primaryGroups(best.pe.exercise)) direct.set(g, (direct.get(g) ?? 0) - 1);
		for (const [g, n] of credit(best)) sets.set(g, (sets.get(g) ?? 0) - n);
		const i = session.exercises.indexOf(best.pe);
		if (i >= 0) session.exercises.splice(i, 1);
		dropped.add(best.pe);
	}

	return picked.filter((p) => !dropped.has(p.pe));
}

/**
 * A bodyweight exercise has no load axis, so reps are its only dial: 3–6
 * push-ups at two reps in reserve is a prescription nobody can follow. The
 * profile's range still applies where it can be met; the floor lifts to 8.
 */
const UNLOADED_REP_MIN = 8;
const UNLOADED_REP_MAX = 15;

function repsFor(
	rx: { rep_min: number; rep_max: number },
	exercise: Exercise
): { rep_min: number; rep_max: number } {
	if (exercise.measurement !== 'reps_only') return { rep_min: rx.rep_min, rep_max: rx.rep_max };
	return {
		rep_min: Math.max(rx.rep_min, UNLOADED_REP_MIN),
		rep_max: Math.max(rx.rep_max, UNLOADED_REP_MAX)
	};
}

/** Names of sessions with nothing in them. Saving one makes a training day
 *  you cannot train, so the save action refuses it. */
export function emptySessions(draft: Pick<RoutineDraft, 'sessions'>): string[] {
	return draft.sessions.filter((s) => s.exercises.length === 0).map((s) => s.name);
}

/** A posted draft parses as JSON before anything trusts its shape. */
export function isDraftShape(value: unknown): value is RoutineDraft {
	const d = value as RoutineDraft | null;
	return (
		!!d &&
		Array.isArray(d.sessions) &&
		d.sessions.length > 0 &&
		d.sessions.every(
			(s) =>
				!!s &&
				typeof s.name === 'string' &&
				Array.isArray(s.exercises) &&
				s.exercises.every((e) => !!e && typeof e.exercise?.id === 'string')
		)
	);
}

/**
 * Leg extensions exist only as machines. Without one, the second knee-dominant
 * movement on a leg day becomes a lunge rather than a warning, so a barbell
 * or dumbbell gym does not fall back to one squat against three hinges.
 *
 * The stand-in keeps the dose of the slot it replaces: an accessory lunge at
 * isolation sets and reps, not a third heavy knee compound. At compound dose
 * a strength day ran squat, split squat and walking lunge at 4×3–6 each.
 */
const FALLBACK: Partial<Record<MovementPattern, MovementPattern>> = {
	leg_extension: 'lunge',
	// No barbell or dumbbell vertical pull exists. Without a cable stack or a
	// bar, a pull day kept one row and back finished a minimalist week on 2.5
	// sets; a second row is the coach's stand-in.
	vertical_pull: 'horizontal_pull',
	// Bodyweight gyms. Both fire only when the pattern has no candidate at
	// all, so a gym with a single dumbbell is untouched. A chin-up is the
	// curl a bar gym has; another push-up variant is the fly a floor has.
	biceps_curl: 'vertical_pull',
	chest_fly: 'horizontal_press'
};

/** The gym key that unlocks pull-ups, hanging raises and dips. */
export const BAR_KEY = 'pull-up bar';

function resolveSlot(slot: Slot, byPattern: Map<MovementPattern, Exercise[]>): Slot {
	const fallback = FALLBACK[slot.pattern];
	if (!fallback || (byPattern.get(slot.pattern)?.length ?? 0) > 0) return slot;
	return { ...slot, pattern: fallback };
}

export interface GenerateInput {
	daysPerWeek: 2 | 3 | 4 | 5 | 6;
	equipment: string[];
	profileKey: string;
	/** Defaults by day count — see defaultSplitStyle(). */
	splitStyle?: SplitStyle;
	/** What you want more of. Explicitly chosen, never inferred. */
	emphasis?: Emphasis;
	/** Generator-eligible catalog: every entry must have a movement_pattern. */
	catalog: Exercise[];
}

export function generate(input: GenerateInput): RoutineDraft {
	const profile = PROFILES[input.profileKey] ?? PROFILES.hypertrophy;
	const style = input.splitStyle ?? defaultSplitStyle(input.daysPerWeek);
	const emphasis = input.emphasis ?? 'balanced';
	const template = applyEmphasis(templateFor(input.daysPerWeek, style), emphasis);
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
		if (e.requires_bar && !equipment.has(BAR_KEY)) continue;
		const list = byPattern.get(e.movement_pattern) ?? [];
		list.push(e);
		byPattern.set(e.movement_pattern, list);
	}
	for (const list of byPattern.values()) list.sort((a, b) => b.priority - a.priority);

	// Full body is designed around three sessions. Past that, the same weekly
	// dose is spread thinner rather than repeated: seven fixed slots a day
	// made six days twice the work of three, with heavy squats and hinges
	// every session and nothing to trim them, since the volume pass only adds.
	// Both kinds start scaled, because both recur more often. Isolations keep
	// the unscaled volume-pass cap (see capFor) — rounding and the rotation
	// leave some patterns appearing no more often than at three days, and a
	// scaled cap left abs and arms short of the dose they had there.
	const frequencyScale = style === 'full_body' && input.daysPerWeek > 3 ? 3 / input.daysPerWeek : 1;
	// Halves round down: 2 sets × ¾ rounding back up to 2 left 4-day
	// minimalist full body as heavy as 3 days plus a fourth session.
	const setsFor = (kind: Slot['kind']): number =>
		Math.max(1, Math.ceil(profile[kind].sets * frequencyScale - 0.5));

	const fillable = (p: MovementPattern) => (byPattern.get(p)?.length ?? 0) > 0;

	const sessions: SessionDraft[] = [];
	let picked: Picked[] = [];
	for (const t of template) {
		const session: SessionDraft = { name: t.name, exercises: [] };
		// Fallbacks resolved up front, so the hinge sees the lunge that stands
		// in for a missing leg extension.
		const slots = t.slots.map((s) => resolveSlot(s, byPattern));
		for (const slot of slots) {
			const candidates = rankCandidates(byPattern.get(slot.pattern) ?? [], slot, slots, fillable);
			// A required slot may repeat an exercise from another day once the
			// pattern runs out, never one already in this session: a floor gym's
			// Lower B listed the same step-up twice.
			const inSession = (e: Exercise) => session.exercises.some((x) => x.exercise.id === e.id);
			const pick =
				candidates.find((e) => !usedIds.has(e.id)) ??
				(slot.optional ? undefined : candidates.find((e) => !inSession(e)));
			if (!pick) {
				if (!slot.optional) {
					warnings.push(`No ${slot.pattern.replace('_', ' ')} available for "${t.name}" with your equipment.`);
				}
				continue;
			}
			usedIds.add(pick.id);
			const rx = profile[slot.kind];
			const pe = {
				exercise: pick,
				target_sets: setsFor(slot.kind),
				...repsFor(rx, pick),
				rir_target: profile.rir
			};
			session.exercises.push(pe);
			picked.push({ session, pe, kind: slot.kind, region: slotRegion(slot.pattern) });
		}
		sessions.push(session);
	}

	const maintenance = Math.max(4, Math.round(profile.weekly_sets_min * 0.6));
	picked = trimDeEmphasized(picked, emphasis, maintenance);

	for (const name of emptySessions({ sessions })) {
		warnings.push(
			`"${name}" has no exercises your equipment can fill. Add equipment on the gym page or pick fewer days before saving.`
		);
	}

	const draft: RoutineDraft = { profile_key: profile.key, sessions, warnings };

	// Volume pass: groups with direct work but below their weekly target get
	// extra sets, up to a per-exercise cap. The target moves with emphasis:
	// emphasized groups aim for the middle of the profile's range, the
	// de-emphasized region runs at maintenance, everything else at the
	// profile minimum. Groups nothing targets produced a slot warning above.
	const mid = Math.round((profile.weekly_sets_min + profile.weekly_sets_max) / 2);
	const targetFor = (group: string): number => {
		if (emphasis === 'balanced') return profile.weekly_sets_min;
		const inLower = LOWER_GROUPS.has(group);
		const inUpper = UPPER_GROUPS.has(group);
		if (emphasis === 'lower') return inLower ? mid : inUpper ? maintenance : profile.weekly_sets_min;
		return inUpper ? mid : inLower ? maintenance : profile.weekly_sets_min;
	};

	// One cap for everything made a fifth set of barbell squats and a fifth set
	// of hanging leg raises the same prescription. They are not.
	const capFor = (p: Picked): number =>
		p.kind === 'compound' ? setsFor('compound') + 1 : profile.isolation.sets + 1;
	const all = picked.map((p) => p.pe);
	// Only the groups a routine owes direct work to get chased. traps and
	// lower back are scored and displayed but sit outside MAJOR_GROUPS,
	// because rows, hinges and carries feed them without a slot of their own —
	// handing them a weekly target too would pump shrugs and deadlifts to the
	// cap chasing a number nobody set.
	const owed = new Set<string>(MAJOR_GROUPS);
	for (let iter = 0; iter < 80; iter++) {
		const vol = weeklySetsByGroup(draft);
		// The set goes to whichever eligible exercise has the fewest, so volume
		// spreads across a session instead of saturating whatever the template
		// happened to list first — which is the only reason the old pass
		// produced 5/5/5 and called it a prescription.
		// Ties go to the lighter session: with a one-set base at six days,
		// list order alone gave sessions A–C every extra set and left D at
		// seven single sets.
		let pick: PrescribedExercise | undefined;
		let fewest = Infinity;
		let lightest = Infinity;
		for (const p of picked) {
			if (p.pe.target_sets >= capFor(p)) continue;
			if (p.pe.target_sets > fewest) continue;
			if (p.pe.target_sets === fewest && sessionSets(p.session) >= lightest) continue;
			if (sessionSets(p.session) >= profile.session_set_cap) continue;
			const groups = primaryGroups(p.pe.exercise);
			// Never past the top of the profile's range, and never past what one
			// session can usefully give a single muscle. Secondary groups count
			// here too: a set added to a row is half a set of biceps whether or
			// not biceps is what the set was for.
			const credited = [...groups, ...secondaryGroups(p.pe.exercise)];
			if (credited.some((g) => (vol[g] ?? 0) >= profile.weekly_sets_max)) continue;
			if (groups.some((g) => directSetsInSession(p.session, g) >= MAX_DIRECT_SETS_PER_SESSION)) continue;
			const eligible = groups.some((g) => owed.has(g) && (vol[g] ?? 0) < targetFor(g));
			if (!eligible) continue;
			pick = p.pe;
			fewest = p.pe.target_sets;
			lightest = sessionSets(p.session);
		}
		if (!pick) break;
		pick.target_sets += 1;
	}

	// The pass above can only add sets to an exercise that trains the group
	// directly, and only up to the caps — so a group can still finish short, or
	// (where the template's own slots overshoot before a set is added) long.
	// Both are worth saying out loud, and the routine page has to be able to say
	// the same things about a routine you have since edited, so the judgement
	// lives in volume.ts rather than here.
	warnings.push(...volumeWarnings(draft, profile).map((w) => w.message));

	return draft;
}
