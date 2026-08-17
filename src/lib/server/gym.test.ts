import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';
import { bootstrapUser, getGym, saveGym } from './gym.ts';

test("a user's gym is their own", async () => {
	const db = testDb();
	await bootstrapUser(db, 1);
	await bootstrapUser(db, 2);
	assert.notEqual((await getGym(db, 1)).id, (await getGym(db, 2)).id);
});

test('a user with no gym gets one rather than an empty shell', async () => {
	// getGym used to lean on seed.sql having put the row there. Nothing does now.
	const db = testDb();
	const gym = await getGym(db, 9);
	assert.ok(gym.id);
	assert.ok(gym.bars.length > 0);
	assert.ok(gym.plates.length > 0);
	assert.ok(gym.equipment.includes('barbell'));
});

test('saving cannot overwrite another user\'s gym', async () => {
	const db = testDb();
	await bootstrapUser(db, 1);
	await bootstrapUser(db, 2);
	const victim = await getGym(db, 1);
	await assert.rejects(() => saveGym(db, 2, { ...victim, name: 'Stolen' }));
	assert.notEqual((await getGym(db, 1)).name, 'Stolen');
});

test('saving your own gym works', async () => {
	const db = testDb();
	await bootstrapUser(db, 1);
	const gym = await getGym(db, 1);
	await saveGym(db, 1, { ...gym, name: 'Iron Temple' });
	assert.equal((await getGym(db, 1)).name, 'Iron Temple');
});

test('bar ids do not collide between users', async () => {
	// They used to derive from the bar's name alone — bar-straight-bar for
	// everyone — which is a primary key collision the moment there are two.
	const db = testDb();
	await bootstrapUser(db, 1);
	await bootstrapUser(db, 2);
	const a = (await getGym(db, 1)).bars.map((b) => b.id);
	const b = (await getGym(db, 2)).bars.map((b) => b.id);
	assert.equal(a.some((id) => b.includes(id)), false);
});

test('bootstrapping twice does not give you a second gym', async () => {
	// The first account to sign up inherits the pre-accounts data, gym included.
	// An unconditional bootstrap hands it a second, empty gym — and getGym then
	// picks between them by id, which is to say arbitrarily.
	const db = testDb();
	await db
		.prepare("INSERT INTO gym (id, name, user_id) VALUES ('gym-default', 'Existing', 1)")
		.run();
	await bootstrapUser(db, 1);
	const { results } = await db.prepare('SELECT id FROM gym WHERE user_id = 1').all();
	assert.equal(results.length, 1);
	assert.equal((await getGym(db, 1)).name, 'Existing');
});

test('a gym carries its owner', async () => {
	const db = testDb();
	await bootstrapUser(db, 7);
	const row = await db
		.prepare('SELECT user_id FROM gym WHERE id = ?')
		.bind((await getGym(db, 7)).id)
		.first<{ user_id: number }>();
	assert.equal(row!.user_id, 7);
});
