// Personal records. Pure — no DOM, no D1, no $lib imports — so every rule a
// lifter would argue about is testable without a database standing in the way.

import type { Measurement } from './types.ts';

export interface RecordSet {
	weight_lb: number | null;
	reps: number | null;
	duration_s: number | null;
	distance_m: number | null;
	completed_at: string;
}

export type RecordKind = 'heaviest' | 'e1rm' | 'best_set' | 'most_reps' | 'longest' | 'furthest';

export interface PersonalRecord {
	kind: RecordKind;
	label: string;
	/** The comparable number. Its unit follows from the kind. */
	value: number;
	set: RecordSet;
}

/**
 * Epley. Ranks 225×5 (262.5) above 245×1 (253.2), which is the truer read of
 * what someone can lift. It drifts optimistic past about ten reps, which is
 * why the set that produced it is always displayed beside it.
 */
export function epley(weightLb: number, reps: number): number {
	return weightLb * (1 + reps / 30);
}

/** Which records a measurement even has. Array order is display order. */
const KINDS: Record<Measurement, RecordKind[]> = {
	load_reps: ['heaviest', 'e1rm', 'best_set'],
	load_time: ['heaviest', 'longest'],
	reps_only: ['most_reps'],
	time: ['longest'],
	distance_time: ['furthest', 'longest']
};

const LABEL: Record<RecordKind, string> = {
	heaviest: 'Heaviest',
	e1rm: 'Est. 1RM',
	best_set: 'Best set',
	most_reps: 'Most reps',
	longest: 'Longest',
	furthest: 'Furthest'
};

/** Null when the set cannot score this kind — a set with no weight has no 1RM. */
function score(kind: RecordKind, s: RecordSet): number | null {
	switch (kind) {
		case 'heaviest':
			return s.weight_lb;
		case 'e1rm':
			return s.weight_lb != null && s.reps != null && s.reps > 0
				? epley(s.weight_lb, s.reps)
				: null;
		case 'best_set':
			return s.weight_lb != null && s.reps != null ? s.weight_lb * s.reps : null;
		case 'most_reps':
			return s.reps;
		case 'longest':
			return s.duration_s;
		case 'furthest':
			return s.distance_m;
	}
}

function beats(value: number, s: RecordSet, best: PersonalRecord): boolean {
	if (value !== best.value) return value > best.value;
	// A tie belongs to whoever got there first: repeating a record is not
	// setting one, and this also makes the result independent of input order.
	return Date.parse(s.completed_at) < Date.parse(best.set.completed_at);
}

/**
 * The best set for each record the measurement offers. Absent, not zero, when
 * nothing logged can score it.
 */
export function bestRecords(sets: RecordSet[], measurement: Measurement): PersonalRecord[] {
	const out: PersonalRecord[] = [];
	for (const kind of KINDS[measurement]) {
		let best: PersonalRecord | null = null;
		for (const s of sets) {
			const value = score(kind, s);
			if (value === null || value <= 0) continue;
			if (best && !beats(value, s, best)) continue;
			best = { kind, label: LABEL[kind], value, set: s };
		}
		if (best) out.push(best);
	}
	return out;
}

/** Tonnage in the only unit a lifter has a feel for. */
export const plateEquivalent = (volumeLb: number, denominationLb = 45): number =>
	Math.round(volumeLb / denominationLb);
