import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb } from './testdb.ts';
import { generatorCatalog, getExercise } from './catalog.ts';

test('the bar flag reaches the generator and the swap ranking as a boolean', async () => {
	const db = testDb();
	await db.batch([
		db.prepare(
			`INSERT INTO exercise (id, name, measurement, movement_pattern, progression, equipment, priority, requires_bar)
			 VALUES ('pullup', 'Pull-Up', 'load_reps', 'vertical_pull', 'double', 'body only', 95, 1),
			        ('pushup', 'Push-Up', 'reps_only', 'horizontal_press', 'double', 'body only', 70, 0)`
		)
	]);
	const byId = new Map((await generatorCatalog(db)).map((e) => [e.id, e]));
	assert.equal(byId.get('pullup')?.requires_bar, true);
	assert.equal(byId.get('pushup')?.requires_bar, false);
	assert.equal((await getExercise(db, 'pullup'))?.requires_bar, true);
});
