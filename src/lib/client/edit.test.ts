import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSet, payloadFromEdits, toEditable, type EditableSet, type HistoryWorkout } from './edit.ts';

const STARTED = '2026-07-24T17:00:00.000Z';
const FINISHED = '2026-07-24T18:12:00.000Z';

const workout: HistoryWorkout = {
	id: 'w1',
	routine_session_id: 'rs1',
	started_at: STARTED,
	finished_at: FINISHED,
	notes: null
};

/** Rows shaped the way workoutDetail returns them: SQLite ints, join extras. */
const rows = () => [
	{
		id: 's1', workout_id: 'w1', exercise_id: 'ex1', position: 0,
		weight_lb: 45, reps: 10, duration_s: null, distance_m: null, rir: null,
		is_warmup: 1, completed_at: STARTED,
		exercise_name: 'Barbell Squat', measurement: 'load_reps', equipment: 'barbell'
	},
	{
		id: 's2', workout_id: 'w1', exercise_id: 'ex1', position: 1,
		weight_lb: 315, reps: 5, duration_s: null, distance_m: null, rir: 2,
		is_warmup: 0, completed_at: FINISHED,
		exercise_name: 'Barbell Squat', measurement: 'load_reps', equipment: 'barbell'
	}
];

test('toEditable turns SQLite 0/1 into booleans and keeps the render columns', () => {
	const sets = toEditable(rows());
	assert.equal(sets[0].is_warmup, true);
	assert.equal(sets[1].is_warmup, false);
	assert.equal(sets[0].exercise_name, 'Barbell Squat');
	assert.equal(sets[0].measurement, 'load_reps');
	assert.equal(sets[0].equipment, 'barbell');
});

test('payloadFromEdits renumbers positions, closing the gap a deletion leaves', () => {
	const sets = toEditable(rows());
	// Drop the first set. Its position 0 must not survive as a hole.
	const payload = payloadFromEdits(workout, [sets[1]]);
	assert.equal(payload.sets.length, 1);
	assert.equal(payload.sets[0].position, 0);
	assert.equal(payload.sets[0].id, 's2');
});

test('payloadFromEdits strips the join columns the sync endpoint has no place for', () => {
	const payload = payloadFromEdits(workout, toEditable(rows()));
	for (const s of payload.sets) {
		assert.ok(!('exercise_name' in s), 'exercise_name must not be sent');
		assert.ok(!('measurement' in s), 'measurement must not be sent');
		assert.ok(!('equipment' in s), 'equipment must not be sent');
		assert.ok(!('exercise_name' in s), 'exercise_name must not be sent');
		assert.ok(!('workout_id' in s), 'workout_id belongs to the envelope');
	}
});

test('payloadFromEdits preserves the workout envelope untouched', () => {
	const payload = payloadFromEdits(workout, toEditable(rows()));
	assert.deepEqual(payload.workout, {
		id: 'w1',
		routine_session_id: 'rs1',
		started_at: STARTED,
		finished_at: FINISHED,
		notes: null
	});
});

test('a forgotten set is stamped with the workout time, not now', () => {
	// The trap: recentTrainedMuscles filters on `ws.completed_at > ?`, so a set
	// added to a three-week-old workout with today's clock would report that
	// muscle as trained today and skew staleness.
	const added = newSet(workout, toEditable(rows())[1]);
	assert.equal(added.completed_at, FINISHED);
	assert.notEqual(added.completed_at, new Date().toISOString().slice(0, 10));
	assert.equal(added.exercise_id, 'ex1');
	assert.equal(added.is_warmup, false);
	assert.equal(added.weight_lb, null);
});

test('a forgotten set on a workout that never finished falls back to its start', () => {
	const unfinished: HistoryWorkout = { ...workout, finished_at: null };
	assert.equal(newSet(unfinished, toEditable(rows())[1]).completed_at, STARTED);
});

test('every new set gets its own id', () => {
	const from = toEditable(rows())[1];
	const ids = new Set([newSet(workout, from).id, newSet(workout, from).id, newSet(workout, from).id]);
	assert.equal(ids.size, 3);
});

test('swapping the exercise rewrites only the attribution', () => {
	const sets: EditableSet[] = toEditable(rows());
	const swapped = sets.map((s) => ({ ...s, exercise_id: 'ex2', exercise_name: 'Front Squat' }));
	const payload = payloadFromEdits(workout, swapped);
	assert.deepEqual(payload.sets.map((s) => s.exercise_id), ['ex2', 'ex2']);
	// The numbers you actually lifted are untouched by a swap.
	assert.deepEqual(payload.sets.map((s) => [s.weight_lb, s.reps]), [[45, 10], [315, 5]]);
});
