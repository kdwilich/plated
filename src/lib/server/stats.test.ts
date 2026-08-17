import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';
import {
	exportWorkouts,
	headlineRecords,
	lifetimeTotals,
	trainedInWindow,
	trainingDays
} from './stats.ts';

const EX = 'ex-bench';

async function seed(db: D1Database): Promise<D1Database> {
	await db
		.prepare(
			`INSERT INTO exercise (id, name, measurement, movement_pattern, progression, primary_muscles, secondary_muscles)
			 VALUES (?, 'Bench Press', 'load_reps', 'horizontal_press', 'double', '["chest"]', '["triceps"]')`
		)
		.bind(EX)
		.run();
	return db;
}

async function addWorkout(
	db: D1Database,
	opts: {
		id: string;
		user: number;
		started: string;
		finished?: string | null;
		sets?: { weight: number | null; reps: number | null; warmup?: boolean }[];
	}
): Promise<void> {
	await db
		.prepare('INSERT INTO workout (id, started_at, finished_at, user_id) VALUES (?, ?, ?, ?)')
		.bind(
			opts.id,
			opts.started,
			opts.finished === undefined ? opts.started : opts.finished,
			opts.user
		)
		.run();
	let i = 0;
	for (const s of opts.sets ?? []) {
		await db
			.prepare(
				`INSERT INTO workout_set (id, workout_id, exercise_id, position, weight_lb, reps, is_warmup, completed_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(`${opts.id}-s${i}`, opts.id, EX, i, s.weight, s.reps, s.warmup ? 1 : 0, opts.started)
			.run();
		i++;
	}
}

test('lifetime totals count finished working sets', async () => {
	const db = await seed(testDb());
	await addWorkout(db, {
		id: 'w1',
		user: 1,
		started: '2026-03-01T18:00:00Z',
		sets: [
			{ weight: 135, reps: 10, warmup: true },
			{ weight: 225, reps: 5 },
			{ weight: 225, reps: 5 }
		]
	});
	const t = await lifetimeTotals(db, 1);
	assert.equal(t.workouts, 1);
	assert.equal(t.sets, 2, 'the warmup is not a working set');
	assert.equal(t.reps, 10);
	assert.equal(t.volume_lb, 2250);
});

test('an unfinished workout counts for nothing', async () => {
	const db = await seed(testDb());
	await addWorkout(db, {
		id: 'w1',
		user: 1,
		started: '2026-03-01T18:00:00Z',
		finished: null,
		sets: [{ weight: 225, reps: 5 }]
	});
	const t = await lifetimeTotals(db, 1);
	assert.deepEqual(t, { workouts: 0, sets: 0, reps: 0, volume_lb: 0 });
});

test('tonnage treats a bodyweight set as zero rather than as an error', async () => {
	// This is the caveat the stats page prints. If it ever stops being true the
	// wording on the page is wrong.
	const db = await seed(testDb());
	await addWorkout(db, {
		id: 'w1',
		user: 1,
		started: '2026-03-01T18:00:00Z',
		sets: [{ weight: null, reps: 12 }]
	});
	const t = await lifetimeTotals(db, 1);
	assert.equal(t.volume_lb, 0);
	assert.equal(t.reps, 12);
});

test('training days come back as raw timestamps for the browser to bucket', async () => {
	const db = await seed(testDb());
	await addWorkout(db, { id: 'w1', user: 1, started: '2026-03-01T18:00:00Z' });
	const days = await trainingDays(db, 1, 26);
	assert.deepEqual(days, ['2026-03-01T18:00:00Z']);
});

test('training days stop at the window edge', async () => {
	const db = await seed(testDb());
	await addWorkout(db, { id: 'old', user: 1, started: '2020-01-01T18:00:00Z' });
	assert.deepEqual(await trainingDays(db, 1, 26), []);
});

test('the window returns muscles parsed and sets counted', async () => {
	const db = await seed(testDb());
	await addWorkout(db, {
		id: 'w1',
		user: 1,
		started: new Date().toISOString(),
		sets: [
			{ weight: 225, reps: 5 },
			{ weight: 225, reps: 5 },
			{ weight: 135, reps: 10, warmup: true }
		]
	});
	const rows = await trainedInWindow(db, 1, 7);
	assert.equal(rows.length, 1);
	assert.deepEqual(rows[0].primary_muscles, ['chest']);
	assert.deepEqual(rows[0].secondary_muscles, ['triceps']);
	assert.equal(rows[0].sets, 2);
});

test('a headline record carries the set that produced it', async () => {
	// SQLite's bare-column-with-MAX behaviour is load bearing here: without it
	// the page would show a number with no set beside it. If node:sqlite and D1
	// ever disagree about this, this test is where it surfaces.
	const db = await seed(testDb());
	await addWorkout(db, {
		id: 'w1',
		user: 1,
		started: '2026-03-01T18:00:00Z',
		sets: [{ weight: 245, reps: 1 }]
	});
	await addWorkout(db, {
		id: 'w2',
		user: 1,
		started: '2026-03-08T18:00:00Z',
		sets: [{ weight: 225, reps: 5 }]
	});
	const recs = await headlineRecords(db, 1);
	assert.equal(recs.length, 1);
	assert.equal(Math.round(recs[0].best * 10) / 10, 262.5, 'the 225x5 outranks the 245x1');
	assert.equal(recs[0].weight_lb, 225);
	assert.equal(recs[0].reps, 5);
});

test('warmups never set a record', async () => {
	const db = await seed(testDb());
	await addWorkout(db, {
		id: 'w1',
		user: 1,
		started: '2026-03-01T18:00:00Z',
		sets: [
			{ weight: 315, reps: 1, warmup: true },
			{ weight: 225, reps: 5 }
		]
	});
	const recs = await headlineRecords(db, 1);
	assert.equal(recs[0].weight_lb, 225);
});

test('the export carries workouts and their sets together', async () => {
	const db = await seed(testDb());
	await addWorkout(db, {
		id: 'w1',
		user: 1,
		started: '2026-03-01T18:00:00Z',
		sets: [{ weight: 225, reps: 5 }]
	});
	const out = await exportWorkouts(db, 1);
	assert.equal(out.workouts.length, 1);
	assert.equal(out.workouts[0].sets.length, 1);
	assert.equal(out.workouts[0].sets[0].weight_lb, 225);
});
