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
