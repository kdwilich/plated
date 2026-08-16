import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ramp } from './warmup.ts';
import type { GymConfig } from './types.ts';

const GYM: GymConfig = {
	equipment: ['barbell', 'dumbbell', 'machine'],
	plates: [
		{ denomination_lb: 45, pairs: 10 },
		{ denomination_lb: 25, pairs: 2 },
		{ denomination_lb: 10, pairs: 4 },
		{ denomination_lb: 5, pairs: 2 },
		{ denomination_lb: 2.5, pairs: 2 }
	],
	bars: [{ id: 'b', name: 'Straight bar', weight_lb: 45, is_default: true }],
	dumbbell_step_lb: 5,
	machine_step_lb: 10
};

test('barbell compound ramp starts with the empty bar and ascends', () => {
	const r = ramp(225, 'barbell', GYM, 45, true);
	assert.equal(r[0].weight_lb, 45);
	assert.equal(r[0].reps, 10);
	for (let i = 1; i < r.length; i++) {
		assert.ok(r[i].weight_lb > r[i - 1].weight_lb);
		assert.ok(r[i].reps <= r[i - 1].reps);
	}
	// Every step is below the working weight
	assert.ok(r.every((s) => s.weight_lb < 225));
});

test('every barbell step is plate-loadable', () => {
	const r = ramp(225, 'barbell', GYM, 45, true);
	for (const s of r) {
		// achievable = 45 + 2 * (sum of real denominations) -> always x5 with these plates
		assert.equal((s.weight_lb - 45) % 5, 0);
	}
});

test('light barbell work is just the bar', () => {
	assert.deepEqual(ramp(45, 'barbell', GYM, 45, true), []);
	const r = ramp(65, 'barbell', GYM, 45, true);
	assert.equal(r[0].weight_lb, 45);
	assert.ok(r.every((s) => s.weight_lb < 65));
});

test('dumbbell ramp rounds to the rack step and stays below working', () => {
	const r = ramp(70, 'dumbbell', GYM, 0, true);
	assert.ok(r.length >= 1);
	for (const s of r) {
		assert.equal(s.weight_lb % 5, 0);
		assert.ok(s.weight_lb < 70);
	}
});

test('isolation gets a short ramp', () => {
	const compound = ramp(100, 'machine', GYM, 0, true);
	const isolation = ramp(100, 'machine', GYM, 0, false);
	assert.ok(isolation.length <= compound.length);
});

test('bodyweight and zero loads produce no ramp', () => {
	assert.deepEqual(ramp(0, 'body only', GYM, 0, true), []);
});
