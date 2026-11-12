// Progression chains: on a barbell, harder is five pounds; on the floor,
// harder is the next exercise. Each chain is a hand-curated ladder of catalog
// rows. A rung's `target` is what every working set has to reach, two
// sessions running, before the next rung is offered. The top rung has none:
// it progresses the way it always did (more reps, or added load on pull-ups
// and dips).
//
// The current rung is not stored anywhere: routine_exercise.exercise_id is
// the rung. Every id here must exist in the seed with this name and bar
// requirement — chains.test.ts enforces it.

import { suggest, type Suggestion } from './progression.ts';
import type { LoggedSet, ProgressionKind } from './types.ts';

export interface Rung {
	exercise_id: string;
	name: string;
	/** Reps (or seconds, on a time chain) every working set must reach. */
	target?: number;
	/** Needs a bar to hang from or press on. Mirrors exercise.requires_bar. */
	bar?: boolean;
}

export interface Chain {
	key: string;
	label: string;
	unit: 'reps' | 'seconds';
	rungs: Rung[];
}

export const CHAINS: Chain[] = [
	{
		key: 'push',
		label: 'Push',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'Incline_Push-Up', name: 'Incline Push-Up', target: 15 },
			{ exercise_id: 'Pushups', name: 'Pushups', target: 15 },
			{ exercise_id: 'Push-Ups_With_Feet_Elevated', name: 'Push-Ups With Feet Elevated', target: 12 },
			{ exercise_id: 'bw-archer-push-up', name: 'Archer Push-Up', target: 8 },
			{ exercise_id: 'Single-Arm_Push-Up', name: 'Single-Arm Push-Up' }
		]
	},
	{
		key: 'pull',
		label: 'Pull',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'bw-negative-pull-up', name: 'Negative Pull-Up', target: 5, bar: true },
			{ exercise_id: 'Chin-Up', name: 'Chin-Up', target: 10, bar: true },
			{ exercise_id: 'Pullups', name: 'Pullups', bar: true }
		]
	},
	{
		key: 'row',
		label: 'Row',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'Inverted_Row', name: 'Inverted Row', target: 12, bar: true },
			{ exercise_id: 'bw-feet-elevated-inverted-row', name: 'Feet-Elevated Inverted Row', target: 12, bar: true },
			{ exercise_id: 'bw-archer-inverted-row', name: 'Archer Inverted Row', bar: true }
		]
	},
	{
		key: 'squat',
		label: 'Squat',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'Bodyweight_Squat', name: 'Bodyweight Squat', target: 25 },
			{ exercise_id: 'bw-bulgarian-split-squat', name: 'Bulgarian Split Squat (Bodyweight)', target: 15 },
			{ exercise_id: 'bw-box-pistol-squat', name: 'Box Pistol Squat', target: 8 },
			{ exercise_id: 'bw-pistol-squat', name: 'Pistol Squat' }
		]
	},
	{
		key: 'hamstring',
		label: 'Hamstring',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'bw-nordic-negative', name: 'Nordic Curl Negative', target: 6 },
			{ exercise_id: 'Natural_Glute_Ham_Raise', name: 'Natural Glute Ham Raise' }
		]
	},
	{
		key: 'dip',
		label: 'Dip',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'Bench_Dips', name: 'Bench Dips', target: 15 },
			{ exercise_id: 'Dips_-_Triceps_Version', name: 'Dips - Triceps Version', bar: true }
		]
	},
	{
		key: 'leg-raise',
		label: 'Leg raise',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'bw-hanging-knee-raise', name: 'Hanging Knee Raise', target: 15, bar: true },
			{ exercise_id: 'Hanging_Leg_Raise', name: 'Hanging Leg Raise', target: 12, bar: true },
			{ exercise_id: 'bw-toes-to-bar', name: 'Toes-to-Bar', bar: true }
		]
	},
	{
		key: 'l-sit',
		label: 'L-sit',
		unit: 'seconds',
		rungs: [
			{ exercise_id: 'bw-tuck-l-sit', name: 'Tuck L-Sit', target: 20 },
			{ exercise_id: 'bw-l-sit', name: 'L-Sit' }
		]
	},
	{
		key: 'handstand',
		label: 'Handstand',
		unit: 'reps',
		rungs: [
			{ exercise_id: 'bw-pike-push-up', name: 'Pike Push-Up', target: 12 },
			{ exercise_id: 'bw-elevated-pike-push-up', name: 'Elevated Pike Push-Up', target: 10 },
			{ exercise_id: 'Handstand_Push-Ups', name: 'Handstand Push-Ups' }
		]
	}
];

/** A held static under this many seconds, two sessions running, is a step down. */
export const HOLD_FLOOR_S = 10;

export interface ChainPlace {
	chain: Chain;
	/** 0-based. */
	index: number;
	rung: Rung;
	up: Rung | null;
	down: Rung | null;
}

const PLACES = new Map<string, ChainPlace>();
for (const chain of CHAINS) {
	chain.rungs.forEach((rung, index) => {
		PLACES.set(rung.exercise_id, {
			chain,
			index,
			rung,
			up: chain.rungs[index + 1] ?? null,
			down: chain.rungs[index - 1] ?? null
		});
	});
}

export const chainOf = (exerciseId: string): ChainPlace | null => PLACES.get(exerciseId) ?? null;

/** "PUSH · 3/5" */
export function placeLabel(place: ChainPlace): string {
	return `${place.chain.label.toUpperCase()} · ${place.index + 1}/${place.chain.rungs.length}`;
}

/** True when `to` is one rung above or below `from` in the same chain. */
export function areNeighbours(from: string, to: string): boolean {
	const place = chainOf(from);
	return !!place && (place.up?.exercise_id === to || place.down?.exercise_id === to);
}

export interface ChainStep {
	direction: 'up' | 'down';
	rung: Rung;
	note: string;
}

export interface ChainInput {
	exercise_id: string;
	sessions: LoggedSet[][];
	target_sets: number;
	rep_min: number;
	rep_max: number;
	kind: ProgressionKind;
	increment_lb: number;
	is_net_load: boolean;
	uses_load: boolean;
	/** False only when the gym is known to lack a pull-up bar. */
	has_bar: boolean;
}

const working = (sets: LoggedSet[]) => sets.filter((s) => !s.is_warmup);

/**
 * `suggest()`, plus the rung decision. The step comes back beside the ordinary
 * suggestion, not instead of it, so the inputs still prefill when the step is
 * declined.
 */
export function suggestChain(input: ChainInput): { step: ChainStep | null; suggestion: Suggestion | null } {
	let suggestion = suggest(input.sessions, input.rep_min, input.rep_max, input.kind, input.increment_lb, input.is_net_load);
	const place = chainOf(input.exercise_id);
	if (!place) return { step: null, suggestion };

	const timed = place.chain.unit === 'seconds';
	// A rung with no load axis has nothing to "find a weight" for.
	if (suggestion?.type === 'start' && !input.uses_load) {
		suggestion = {
			...suggestion,
			note: timed
				? `New rung. Hold as long as you can, clean, for ${input.target_sets} sets.`
				: `New rung. Find where ${input.rep_min}–${input.rep_max} clean reps land.`
		};
	}

	const past = input.sessions.map(working).filter((s) => s.length > 0);
	if (past.length < 2) return { step: null, suggestion };
	const recent = past.slice(0, 2);
	const score = (s: LoggedSet) => (timed ? (s.duration_s ?? 0) : (s.reps ?? 0));
	const load = (sets: LoggedSet[]) => Math.max(...sets.map((s) => s.weight_lb ?? 0));

	const target = place.rung.target;
	if (place.up && target != null) {
		const beaten = recent.every(
			(sets) => sets.length >= input.target_sets && load(sets) >= 0 && sets.every((s) => score(s) >= target)
		);
		if (beaten) {
			const unit = timed ? `${target}s` : `${target}`;
			if (place.up.bar && !input.has_bar) {
				return {
					step: null,
					suggestion: { ...(suggestion ?? { type: 'repeat' }), note: `${unit} on every set, twice. ${place.up.name} needs a bar.` }
				};
			}
			return {
				step: { direction: 'up', rung: place.up, note: `${unit} on every set, two sessions running.` },
				suggestion
			};
		}
	}

	if (place.down) {
		const floor = timed ? HOLD_FLOOR_S : input.rep_min;
		const stuck = recent.every((sets) => load(sets) === 0 && score(sets[0]) < floor);
		if (stuck && (!place.down.bar || input.has_bar)) {
			const unit = timed ? `${floor}s` : `${floor} reps`;
			return {
				step: { direction: 'down', rung: place.down, note: `First set under ${unit} two sessions running.` },
				suggestion
			};
		}
	}

	return { step: null, suggestion };
}
