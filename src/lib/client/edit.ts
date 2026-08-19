// Editing a finished workout. The edit is not a new write path: it rebuilds
// the same payload the outbox sends after a session and re-sends it, because
// ingestWorkout replaces a workout's sets wholesale. One write path into
// workout_set, and editing works in a dead zone like everything else.

import type { OutboxEntry } from './session';

/** The workout columns /you/history/[id] loads, minus the join extras. */
export interface HistoryWorkout {
	id: string;
	routine_session_id: string | null;
	started_at: string;
	finished_at: string | null;
	notes: string | null;
}

/** A set being edited: the stored row plus what the UI needs to render it. */
export interface EditableSet {
	id: string;
	exercise_id: string;
	exercise_name: string;
	measurement: string;
	equipment: string | null;
	weight_lb: number | null;
	reps: number | null;
	duration_s: number | null;
	distance_m: number | null;
	rir: number | null;
	is_warmup: boolean;
	completed_at: string;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Server rows -> editable sets. SQLite hands back is_warmup as 0/1 and the
 * query adds exercise_name and measurement by join; both have to survive the
 * round trip so the editor can render without a second fetch.
 */
export function toEditable(rows: Record<string, unknown>[]): EditableSet[] {
	return rows.map((r) => ({
		id: String(r.id),
		exercise_id: String(r.exercise_id),
		exercise_name: String(r.exercise_name ?? ''),
		measurement: String(r.measurement ?? 'load_reps'),
		equipment: r.equipment == null ? null : String(r.equipment),
		weight_lb: num(r.weight_lb),
		reps: num(r.reps),
		duration_s: num(r.duration_s),
		distance_m: num(r.distance_m),
		rir: num(r.rir),
		is_warmup: !!r.is_warmup,
		completed_at: String(r.completed_at)
	}));
}

/**
 * A set you forgot to log, added to a workout that is already history.
 *
 * completed_at is the workout's own timestamp, NOT now. recentTrainedMuscles
 * filters on `ws.completed_at > ?` to decide which muscles are stale, so
 * stamping a set from three weeks ago with today's clock would tell the app
 * you trained that muscle today.
 */
export function newSet(workout: HistoryWorkout, from: EditableSet): EditableSet {
	return {
		id: crypto.randomUUID(),
		exercise_id: from.exercise_id,
		exercise_name: from.exercise_name,
		measurement: from.measurement,
		equipment: from.equipment,
		weight_lb: null,
		reps: null,
		duration_s: null,
		distance_m: null,
		rir: null,
		is_warmup: false,
		completed_at: workout.finished_at ?? workout.started_at
	};
}

/**
 * Rebuild the sync payload from the edited list. Positions are renumbered from
 * the array order, since ingestWorkout deletes and re-inserts every row and a
 * gap left by a deleted set would otherwise persist.
 */
export function payloadFromEdits(workout: HistoryWorkout, sets: EditableSet[]): OutboxEntry {
	return {
		workout: {
			id: workout.id,
			routine_session_id: workout.routine_session_id,
			started_at: workout.started_at,
			finished_at: workout.finished_at,
			notes: workout.notes
		},
		sets: sets.map((s, position) => ({
			id: s.id,
			exercise_id: s.exercise_id,
			position,
			weight_lb: s.weight_lb,
			reps: s.reps,
			duration_s: s.duration_s,
			distance_m: s.distance_m,
			rir: s.rir,
			is_warmup: s.is_warmup,
			completed_at: s.completed_at
		}))
	};
}
