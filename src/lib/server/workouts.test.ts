import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';
import {
	deleteWorkout,
	ingestWorkout,
	lastCompletedPosition,
	lastPerformances,
	recentTrainedMuscles,
	recentWorkouts,
	workoutDetail,
	type SyncPayload
} from './workouts.ts';

const NOW = '2026-08-16T12:00:00.000Z';

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

/** The catalog row the sets point at. */
async function seedExercise(db: D1Database, id = 'ex1') {
	await db
		.prepare(
			`INSERT INTO exercise (id, name, measurement, progression, primary_muscles, movement_pattern)
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
