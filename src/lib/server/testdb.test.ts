// Proves the harness itself, before any test relies on it. If these fail, the
// ownership tests that follow prove nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';

test('the real schema and the migration both apply', async () => {
	const db = testDb();
	const row = await db
		.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('user','session','exercise_fts')")
		.first<{ n: number }>();
	assert.equal(row!.n, 3);
});

test('booleans bind, and come back as 0/1 like D1', async () => {
	const db = testDb();
	await db.prepare('INSERT INTO gym (id, name) VALUES (?, ?)').bind('g1', 'My gym').run();
	await db
		.prepare('INSERT INTO gym_bar (id, gym_id, name, weight_lb, is_default) VALUES (?, ?, ?, ?, ?)')
		.bind('b1', 'g1', 'Straight bar', 45, true)
		.run();
	const bar = await db.prepare('SELECT is_default FROM gym_bar WHERE id = ?').bind('b1').first();
	assert.equal(bar!.is_default, 1);
});

test('foreign keys cascade, as they do in D1', async () => {
	const db = testDb();
	await db.prepare('INSERT INTO gym (id, name) VALUES (?, ?)').bind('g1', 'My gym').run();
	await db
		.prepare('INSERT INTO gym_bar (id, gym_id, name, weight_lb, is_default) VALUES (?, ?, ?, ?, ?)')
		.bind('b1', 'g1', 'Straight bar', 45, true)
		.run();
	await db.prepare('DELETE FROM gym WHERE id = ?').bind('g1').run();
	const { results } = await db.prepare('SELECT id FROM gym_bar').all();
	assert.deepEqual(results, []);
});

test('undefined binds as null rather than throwing', async () => {
	const db = testDb();
	// A nullable column: what is under test is that undefined survives the bind
	// at all, since node:sqlite rejects it where D1 accepts it.
	await db
		.prepare('INSERT INTO workout (id, started_at, notes) VALUES (?, ?, ?)')
		.bind('w1', new Date().toISOString(), undefined)
		.run();
	const row = await db.prepare('SELECT notes FROM workout').first();
	assert.equal(row!.notes, null);
});

test('first() returns null for no rows, not undefined', async () => {
	const db = testDb();
	assert.equal(await db.prepare('SELECT id FROM gym WHERE id = ?').bind('nope').first(), null);
});

test('each testDb is isolated from the last', async () => {
	const a = testDb();
	await a.prepare('INSERT INTO gym (id, name) VALUES (?, ?)').bind('g1', 'A').run();
	const b = testDb();
	const { results } = await b.prepare('SELECT id FROM gym').all();
	assert.deepEqual(results, []);
});

test('the runs migration gives workout its two columns', async () => {
	const db = testDb();
	await db
		.prepare(
			`INSERT INTO workout (id, started_at, finished_at, run_type, effort, user_id)
			 VALUES ('w1', '2026-03-01T18:00:00Z', '2026-03-01T18:30:00Z', 'easy', 6, 1)`
		)
		.run();
	const row = await db.prepare('SELECT run_type, effort FROM workout WHERE id = ?').bind('w1').first();
	// Spread first: node:sqlite rows have a null prototype and strict deepEqual
	// compares prototypes, which is why no server test deepEquals a raw row.
	assert.deepEqual({ ...row }, { run_type: 'easy', effort: 6 });
});

test('the run exercise is there before anyone logs a run', async () => {
	// Migration 0003 seeds it so a deploy can never read a run whose exercise
	// is missing. The sync endpoint does not enforce the foreign key, so a
	// missing row would fail quietly: the history join would drop the set.
	const db = testDb();
	const row = await db.prepare('SELECT measurement, progression FROM exercise WHERE id = ?').bind('run').first();
	assert.deepEqual({ ...row }, { measurement: 'distance_time', progression: 'none' });
	const aliases = await db.prepare('SELECT alias FROM exercise_alias WHERE exercise_id = ? ORDER BY alias').bind('run').all();
	assert.deepEqual(aliases.results.map((r) => ({ ...r })), [{ alias: 'Jog' }, { alias: 'Running' }]);
});
