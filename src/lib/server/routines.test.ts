import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';
import {
	activateRoutine,
	addRoutineExercise,
	addRoutineSession,
	createRoutine,
	deleteRoutine,
	deleteRoutineExercise,
	deleteRoutineSession,
	duplicateRoutine,
	getActiveRoutine,
	getRoutine,
	listRoutines,
	moveRoutineSession,
	renameRoutine,
	renameRoutineSession,
	sessionScaffold,
	updateRoutineExercise
} from './routines.ts';

async function seedExercise(db: D1Database, id = 'ex1') {
	await db
		.prepare(
			`INSERT INTO exercise (id, name, measurement, progression, primary_muscles, movement_pattern, mechanic)
			 VALUES (?, ?, 'load_reps', 'double', '["quadriceps"]', 'squat', 'compound')`
		)
		.bind(id, `Exercise ${id}`)
		.run();
}

const RX = { target_sets: 3, rep_min: 6, rep_max: 10, rir_target: 2 };

test('listRoutines shows only your own', async () => {
	const db = testDb();
	await createRoutine(db, 1, 'Mine', 'hypertrophy', null);
	await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	assert.deepEqual((await listRoutines(db, 1)).map((r) => r.name), ['Mine']);
});

test('getRoutine refuses another user\'s routine', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	assert.equal(await getRoutine(db, 1, theirs), null);
	assert.ok(await getRoutine(db, 2, theirs));
});

test('getActiveRoutine returns your active one, not theirs', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await activateRoutine(db, 2, theirs);
	assert.equal(await getActiveRoutine(db, 1), null);
	assert.equal((await getActiveRoutine(db, 2))?.name, 'Theirs');
});

test('activating your routine does not deactivate anyone else\'s', async () => {
	// The deactivate-others sweep used to hit every row in the table.
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await activateRoutine(db, 2, theirs);
	const mine = await createRoutine(db, 1, 'Mine', 'hypertrophy', null);
	await activateRoutine(db, 1, mine);
	assert.equal((await getActiveRoutine(db, 2))?.id, theirs);
});

test('activating another user\'s routine does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await activateRoutine(db, 1, theirs);
	assert.equal(await getActiveRoutine(db, 2), null);
});

test('deleting another user\'s routine does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await deleteRoutine(db, 1, theirs);
	assert.ok(await getRoutine(db, 2, theirs));
});

test('deleting your active routine promotes your own survivor, not theirs', async () => {
	// deleteRoutine picked the newest routine in the whole table.
	const db = testDb();
	const mine = await createRoutine(db, 1, 'Mine', 'hypertrophy', null);
	await activateRoutine(db, 1, mine);
	await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await deleteRoutine(db, 1, mine);
	assert.equal(await getActiveRoutine(db, 1), null);
});

test('deleting your active routine promotes your next one', async () => {
	const db = testDb();
	const older = await createRoutine(db, 1, 'Older', 'hypertrophy', null);
	const newer = await createRoutine(db, 1, 'Newer', 'hypertrophy', null);
	await activateRoutine(db, 1, newer);
	await deleteRoutine(db, 1, newer);
	assert.equal((await getActiveRoutine(db, 1))?.id, older);
});

test('renaming another user\'s routine does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await renameRoutine(db, 1, theirs, 'Renamed');
	assert.equal((await getRoutine(db, 2, theirs))?.name, 'Theirs');
});

test('duplicating another user\'s routine is refused', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	assert.equal(await duplicateRoutine(db, 1, theirs), null);
});

test('a duplicate belongs to the person who made it', async () => {
	const db = testDb();
	const mine = await createRoutine(db, 1, 'Mine', 'hypertrophy', null);
	const copy = await duplicateRoutine(db, 1, mine);
	assert.ok(await getRoutine(db, 1, copy!));
	assert.equal(await getRoutine(db, 2, copy!), null);
});

test('a new routine carries its owner and starts inactive', async () => {
	const db = testDb();
	const id = await createRoutine(db, 7, 'Mine', 'hypertrophy', null);
	const row = await db.prepare('SELECT user_id, is_active FROM routine WHERE id = ?').bind(id).first();
	assert.equal(row!.user_id, 7);
	assert.equal(row!.is_active, 0);
});

test('adding a day to another user\'s routine does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 1, theirs, 'Push');
	assert.equal((await getRoutine(db, 2, theirs))?.sessions.length, 0);
});

test('renaming another user\'s day does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 2, theirs, 'Push');
	const day = (await getRoutine(db, 2, theirs))!.sessions[0];
	await renameRoutineSession(db, 1, day.id, 'Stolen');
	assert.equal((await getRoutine(db, 2, theirs))!.sessions[0].name, 'Push');
});

test('deleting another user\'s day does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 2, theirs, 'Push');
	const day = (await getRoutine(db, 2, theirs))!.sessions[0];
	await deleteRoutineSession(db, 1, day.id);
	assert.equal((await getRoutine(db, 2, theirs))!.sessions.length, 1);
});

test('reordering another user\'s days does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 2, theirs, 'A');
	await addRoutineSession(db, 2, theirs, 'B');
	const second = (await getRoutine(db, 2, theirs))!.sessions[1];
	await moveRoutineSession(db, 1, second.id, 'up');
	assert.deepEqual((await getRoutine(db, 2, theirs))!.sessions.map((s) => s.name), ['A', 'B']);
});

test('reordering your own days works', async () => {
	const db = testDb();
	const mine = await createRoutine(db, 1, 'Mine', 'hypertrophy', null);
	await addRoutineSession(db, 1, mine, 'A');
	await addRoutineSession(db, 1, mine, 'B');
	const second = (await getRoutine(db, 1, mine))!.sessions[1];
	await moveRoutineSession(db, 1, second.id, 'up');
	assert.deepEqual((await getRoutine(db, 1, mine))!.sessions.map((s) => s.name), ['B', 'A']);
});

test('adding an exercise to another user\'s day does nothing', async () => {
	const db = testDb();
	await seedExercise(db);
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 2, theirs, 'Push');
	const day = (await getRoutine(db, 2, theirs))!.sessions[0];
	await addRoutineExercise(db, 1, day.id, 'ex1', RX);
	assert.equal((await getRoutine(db, 2, theirs))!.sessions[0].exercises.length, 0);
});

test('editing another user\'s exercise does nothing', async () => {
	const db = testDb();
	await seedExercise(db);
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 2, theirs, 'Push');
	const day = (await getRoutine(db, 2, theirs))!.sessions[0];
	await addRoutineExercise(db, 2, day.id, 'ex1', RX);
	const re = (await getRoutine(db, 2, theirs))!.sessions[0].exercises[0];
	await updateRoutineExercise(db, 1, re.id, { target_sets: 99 });
	assert.equal((await getRoutine(db, 2, theirs))!.sessions[0].exercises[0].target_sets, 3);
});

test('removing another user\'s exercise does nothing', async () => {
	const db = testDb();
	await seedExercise(db);
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 2, theirs, 'Push');
	const day = (await getRoutine(db, 2, theirs))!.sessions[0];
	await addRoutineExercise(db, 2, day.id, 'ex1', RX);
	const re = (await getRoutine(db, 2, theirs))!.sessions[0].exercises[0];
	await deleteRoutineExercise(db, 1, re.id);
	assert.equal((await getRoutine(db, 2, theirs))!.sessions[0].exercises.length, 1);
});

test('a session scaffold is refused for another user\'s day', async () => {
	const db = testDb();
	await seedExercise(db);
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await addRoutineSession(db, 2, theirs, 'Push');
	const day = (await getRoutine(db, 2, theirs))!.sessions[0];
	await addRoutineExercise(db, 2, day.id, 'ex1', RX);
	assert.equal(await sessionScaffold(db, 1, day.id), null);
	const mine = await sessionScaffold(db, 2, day.id);
	assert.equal(mine?.name, 'Push');
	assert.equal(mine?.exercises.length, 1);
});
