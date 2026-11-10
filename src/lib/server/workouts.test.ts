import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';
import {
	deleteWorkout,
	exerciseSets,
	ingestWorkout,
	lastCompletedPosition,
	lastPerformances,
	recentActivity,
	recentTrainedMuscles,
	recentWorkouts,
	runFieldsValid,
	workoutDetail,
	type SyncPayload
} from './workouts.ts';

// An hour ago, not a pinned date: recentTrainedMuscles measures its window
// from Date.now(), so a fixed timestamp would age out of it and the test
// would start failing with no code change.
const NOW = new Date(Date.now() - 3_600_000).toISOString();

function payload(id: string, exerciseId = 'ex1', sessionId: string | null = null): SyncPayload {
	return {
		workout: {
			id,
			routine_session_id: sessionId,
			started_at: NOW,
			finished_at: NOW,
			notes: null
		},
		sets: [
			{
				id: `${id}-s1`,
				exercise_id: exerciseId,
				position: 0,
				weight_lb: 315,
				reps: 5,
				duration_s: null,
				distance_m: null,
				rir: 2,
				is_warmup: false,
				completed_at: NOW
			}
		]
	};
}

/** The catalog row the sets point at. OR REPLACE because migration 0003
 *  already seeds `run`, and a test that asks for that id wants its own shape. */
async function seedExercise(db: D1Database, id = 'ex1') {
	await db
		.prepare(
			`INSERT OR REPLACE INTO exercise (id, name, measurement, progression, primary_muscles, movement_pattern)
			 VALUES (?, ?, 'load_reps', 'double', '["quadriceps"]', 'squat')`
		)
		.bind(id, `Exercise ${id}`)
		.run();
}

test('recentWorkouts shows only your own', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	await ingestWorkout(db, 2, payload('w2'));
	assert.deepEqual((await recentWorkouts(db, 1)).map((w) => w.id), ['w1']);
});

test('workoutDetail refuses another user\'s workout', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	assert.equal((await workoutDetail(db, 2, 'w1')).workout, null);
	assert.deepEqual((await workoutDetail(db, 2, 'w1')).sets, []);
});

test('deleteWorkout cannot delete another user\'s workout', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	await deleteWorkout(db, 2, 'w1');
	assert.ok((await workoutDetail(db, 1, 'w1')).workout);
});

test('deleteWorkout deletes your own, sets included', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	await deleteWorkout(db, 1, 'w1');
	assert.equal((await workoutDetail(db, 1, 'w1')).workout, null);
	const { results } = await db.prepare('SELECT id FROM workout_set').all();
	assert.deepEqual(results, []);
});

test('lastPerformances does not leak another user\'s sets', async () => {
	// The sharpest one: this drives "last time you did this", so an unscoped
	// version seeds one person's working weight from another's.
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	assert.deepEqual(await lastPerformances(db, 2, ['ex1']), {});
	assert.ok((await lastPerformances(db, 1, ['ex1']))['ex1']);
});

test('ingestWorkout ignores any owner in the payload', async () => {
	const db = testDb();
	await seedExercise(db);
	const tampered = { ...payload('w1'), user_id: 2 } as SyncPayload;
	await ingestWorkout(db, 1, tampered);
	const row = await db.prepare('SELECT user_id FROM workout WHERE id = ?').bind('w1').first();
	assert.equal(row!.user_id, 1);
});

test('re-ingesting your own workout stays idempotent', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	await ingestWorkout(db, 1, payload('w1'));
	const row = await db.prepare('SELECT COUNT(*) AS n FROM workout_set').first<{ n: number }>();
	assert.equal(row!.n, 1);
});

// ---------------------------------------------------------------------------
// ingestWorkout is the edit primitive: the history editor re-sends a whole
// workout through /api/sync rather than writing to workout_set directly, so
// these pin the replace semantics that editing depends on.

test('re-ingesting with a changed set overwrites the old values', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));

	// Same set id, corrected numbers: 315x5 was really 325x3.
	const edited = payload('w1');
	edited.sets[0].weight_lb = 325;
	edited.sets[0].reps = 3;
	await ingestWorkout(db, 1, edited);

	const rows = await db
		.prepare('SELECT weight_lb, reps FROM workout_set WHERE workout_id = ?')
		.bind('w1')
		.all<{ weight_lb: number; reps: number }>();
	assert.equal(rows.results.length, 1);
	assert.equal(rows.results[0].weight_lb, 325);
	assert.equal(rows.results[0].reps, 3);
});

test('a set dropped from the payload is deleted, not left behind', async () => {
	const db = testDb();
	await seedExercise(db);
	const three = payload('w1');
	three.sets.push({ ...three.sets[0], id: 'w1-s2', position: 1 });
	three.sets.push({ ...three.sets[0], id: 'w1-s3', position: 2 });
	await ingestWorkout(db, 1, three);

	// Delete the middle one and renumber, exactly as the editor will.
	const two = payload('w1');
	two.sets = [
		{ ...three.sets[0], position: 0 },
		{ ...three.sets[2], position: 1 }
	];
	await ingestWorkout(db, 1, two);

	const rows = await db
		.prepare('SELECT id, position FROM workout_set WHERE workout_id = ? ORDER BY position')
		.bind('w1')
		.all<{ id: string; position: number }>();
	assert.deepEqual(
		rows.results.map((r) => [r.id, r.position]),
		[
			['w1-s1', 0],
			['w1-s3', 1]
		]
	);
});

test('a set added to the payload appears', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));

	const grown = payload('w1');
	grown.sets.push({ ...grown.sets[0], id: 'w1-s2', position: 1, weight_lb: 335, reps: 1 });
	await ingestWorkout(db, 1, grown);

	const row = await db
		.prepare('SELECT COUNT(*) AS n FROM workout_set WHERE workout_id = ?')
		.bind('w1')
		.first<{ n: number }>();
	assert.equal(row!.n, 2);
});

test('swapping the exercise on a logged set moves it to the new exercise', async () => {
	const db = testDb();
	await seedExercise(db, 'ex1');
	await seedExercise(db, 'ex2');
	await ingestWorkout(db, 1, payload('w1', 'ex1'));

	const swapped = payload('w1', 'ex1');
	swapped.sets[0].exercise_id = 'ex2';
	await ingestWorkout(db, 1, swapped);

	const row = await db
		.prepare('SELECT exercise_id FROM workout_set WHERE workout_id = ?')
		.bind('w1')
		.first<{ exercise_id: string }>();
	assert.equal(row!.exercise_id, 'ex2');
	// The old attribution is gone, which is why the UI has to warn that volume
	// and records move between muscle groups.
	const stale = await db
		.prepare('SELECT COUNT(*) AS n FROM workout_set WHERE exercise_id = ?')
		.bind('ex1')
		.first<{ n: number }>();
	assert.equal(stale!.n, 0);
});

test('editing a set does not disturb the workout timestamps', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));

	const edited = payload('w1');
	edited.sets[0].reps = 8;
	await ingestWorkout(db, 1, edited);

	// The streak and the heatmap read these. An edit must not move a workout
	// to a different day.
	const row = await db
		.prepare('SELECT started_at, finished_at FROM workout WHERE id = ?')
		.bind('w1')
		.first<{ started_at: string; finished_at: string }>();
	assert.equal(row!.started_at, NOW);
	assert.equal(row!.finished_at, NOW);
});

test('one user cannot overwrite another\'s workout by reusing its id', async () => {
	// Ids are client-generated, so a hostile client can pick one it has seen.
	const db = testDb();
	await seedExercise(db);
	assert.equal(await ingestWorkout(db, 1, payload('w1')), true);
	// False, so the route can answer 409 and the sender's outbox keeps the
	// entry. A silent success would make it delete an unsynced workout.
	assert.equal(await ingestWorkout(db, 2, payload('w1')), false);
	const row = await db.prepare('SELECT user_id FROM workout WHERE id = ?').bind('w1').first();
	assert.equal(row!.user_id, 1);
});

test('recentTrainedMuscles does not count another user\'s work', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	assert.deepEqual(await recentTrainedMuscles(db, 2), []);
	assert.equal((await recentTrainedMuscles(db, 1)).length, 1);
});

test('lastCompletedPosition does not read another user\'s rotation', async () => {
	const db = testDb();
	await seedExercise(db);
	await db.prepare("INSERT INTO routine (id, name, created_at, user_id) VALUES ('r1','R',?,1)").bind(NOW).run();
	await db.prepare("INSERT INTO routine_session (id, routine_id, position, name) VALUES ('rs1','r1',2,'Day')").run();
	await ingestWorkout(db, 1, payload('w1', 'ex1', 'rs1'));
	assert.equal(await lastCompletedPosition(db, 1, 'r1'), 2);
	assert.equal(await lastCompletedPosition(db, 2, 'r1'), null);
});

test('exerciseSets returns every working set for one exercise, newest first', async () => {
	const db = testDb();
	await seedExercise(db);
	const older = payload('w1');
	older.workout.started_at = '2026-03-01T18:00:00.000Z';
	older.sets[0].completed_at = '2026-03-01T18:00:00.000Z';
	older.sets.push({ ...older.sets[0], id: 'w1-s2', weight_lb: 135, is_warmup: true });
	await ingestWorkout(db, 1, older);
	await ingestWorkout(db, 1, payload('w2'));

	const sets = await exerciseSets(db, 1, 'ex1');
	assert.equal(sets.length, 2, 'the warmup is excluded');
	assert.equal(sets[0].completed_at, NOW, 'newest first');
});

test('exerciseSets ignores a workout that never finished', async () => {
	// A session abandoned mid-set must not hand out a personal record.
	const db = testDb();
	await seedExercise(db);
	const abandoned = payload('w1');
	abandoned.workout.finished_at = null;
	abandoned.sets[0].weight_lb = 405;
	await ingestWorkout(db, 1, abandoned);
	assert.deepEqual(await exerciseSets(db, 1, 'ex1'), []);
});

test('exerciseSets does not read another user\'s lifts', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	assert.deepEqual(await exerciseSets(db, 2, 'ex1'), []);
});

test('a run round-trips with its type and effort', async () => {
	const db = testDb();
	await seedExercise(db, 'run');
	const p = payload('r1', 'run');
	p.workout.run_type = 'easy';
	p.workout.effort = 6;
	p.sets[0] = { ...p.sets[0], weight_lb: null, reps: null, duration_s: 1470, distance_m: 5000 };
	await ingestWorkout(db, 1, p);
	const { workout } = await workoutDetail(db, 1, 'r1');
	assert.equal(workout!.run_type, 'easy');
	assert.equal(workout!.effort, 6);
});

test('a payload from before the run columns stores nulls, and still drains', async () => {
	const db = testDb();
	await seedExercise(db);
	const p = payload('w1') as unknown as { workout: Record<string, unknown> };
	delete p.workout.run_type;
	delete p.workout.effort;
	assert.equal(await ingestWorkout(db, 1, p as unknown as SyncPayload), true);
	const { workout } = await workoutDetail(db, 1, 'w1');
	assert.equal(workout!.run_type, null);
	assert.equal(workout!.effort, null);
});

test('re-ingesting a run from the editor keeps it a run', async () => {
	// INSERT OR REPLACE erases every column it does not list. The editor
	// rebuilds the payload from what it loaded, so if it ever dropped these two
	// fields an edit would silently turn a run back into a strength workout.
	const db = testDb();
	await seedExercise(db, 'run');
	const p = payload('r1', 'run');
	p.workout.run_type = 'tempo';
	p.workout.effort = 8;
	await ingestWorkout(db, 1, p);
	await ingestWorkout(db, 1, { ...p, sets: [] });
	const { workout } = await workoutDetail(db, 1, 'r1');
	assert.equal(workout!.run_type, 'tempo');
	assert.equal(workout!.effort, 8);
});

test('the sync endpoint can refuse what the schema cannot', () => {
	const w = payload('w1').workout;
	assert.equal(runFieldsValid(w), true);
	assert.equal(runFieldsValid({ ...w, run_type: 'easy', effort: 6 }), true);
	assert.equal(runFieldsValid({ ...w, run_type: 'jog' }), false);
	assert.equal(runFieldsValid({ ...w, effort: 11 }), false);
	assert.equal(runFieldsValid({ ...w, effort: 0 }), false);
	assert.equal(runFieldsValid({ ...w, effort: 6.5 }), false);
});

test('recentWorkouts says which rows are runs and how far they went', async () => {
	const db = testDb();
	await seedExercise(db, 'run');
	const p = payload('r1', 'run');
	p.workout.run_type = 'easy';
	p.sets[0] = { ...p.sets[0], weight_lb: null, reps: null, duration_s: 1470, distance_m: 5000 };
	// A second set, as an interval session will have, sums.
	p.sets.push({ ...p.sets[0], id: 'r1-s2', position: 1, distance_m: 400, duration_s: 90, is_warmup: true });
	await ingestWorkout(db, 1, p);
	const [row] = await recentWorkouts(db, 1);
	assert.equal(row.run_type, 'easy');
	assert.equal(row.total_distance_m, 5400);
});

test('a strength workout has no run_type and zero distance in the list', async () => {
	const db = testDb();
	await seedExercise(db);
	await ingestWorkout(db, 1, payload('w1'));
	const [row] = await recentWorkouts(db, 1);
	assert.equal(row.run_type, null);
	assert.equal(row.total_distance_m, 0);
});

test('recentActivity returns finished workouts in the window, yours only', async () => {
	const db = testDb();
	await seedExercise(db);
	await seedExercise(db, 'run');
	await ingestWorkout(db, 1, payload('w1'));
	const run = payload('r1', 'run');
	run.workout.run_type = 'easy';
	run.sets[0] = { ...run.sets[0], weight_lb: null, reps: null, duration_s: 1470, distance_m: 5000 };
	await ingestWorkout(db, 1, run);
	const old = payload('old');
	old.workout.started_at = '2020-01-01T10:00:00.000Z';
	old.workout.finished_at = '2020-01-01T11:00:00.000Z';
	await ingestWorkout(db, 1, old);
	const open = payload('open');
	open.workout.finished_at = null;
	await ingestWorkout(db, 1, open);
	await ingestWorkout(db, 2, payload('theirs'));

	const rows = await recentActivity(db, 1, 8);
	// Default sort is by string, and "," (the null row) sorts before "e".
	assert.deepEqual(
		rows.map((r) => [r.run_type, r.distance_m]).sort(),
		[
			[null, 0],
			['easy', 5000]
		]
	);
});
