import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, incrementFor } from './progression.ts';
import type { GymConfig, LoggedSet } from './types.ts';

const GYM: GymConfig = {
	equipment: ['barbell', 'dumbbell', 'machine'],
	plates: [
		{ denomination_lb: 45, pairs: 10 },
		{ denomination_lb: 2.5, pairs: 2 }
	],
	bars: [{ id: 'b', name: 'Straight bar', weight_lb: 45, is_default: true }],
	dumbbell_step_lb: 5,
	machine_step_lb: 10
};

const set = (weight: number, reps: number): LoggedSet => ({
	weight_lb: weight,
	reps,
	duration_s: null,
	is_warmup: false
});

test('increment is equipment-aware', () => {
	assert.equal(incrementFor('barbell', GYM), 5); // 2 x 2.5
	assert.equal(incrementFor('dumbbell', GYM), 5);
	assert.equal(incrementFor('machine', GYM), 10);
	assert.equal(incrementFor('body only', GYM), 0);
	assert.equal(incrementFor('machine', GYM, 2.5), 2.5); // override wins
});

test('no history -> start', () => {
	assert.equal(suggest([], 6, 10, 'double', 5)?.type, 'start');
});

test('all sets at rep_max -> add load, back to rep_min', () => {
	const s = suggest([[set(185, 10), set(185, 10), set(185, 10)]], 6, 10, 'double', 5);
	assert.equal(s?.type, 'add_load');
	assert.equal(s?.weight_lb, 190);
	assert.equal(s?.target_reps, 6);
});

test('mid-range -> keep weight, chase reps', () => {
	const s = suggest([[set(185, 8), set(185, 8), set(185, 7)]], 6, 10, 'double', 5);
	assert.equal(s?.type, 'add_reps');
	assert.equal(s?.weight_lb, 185);
	assert.equal(s?.target_reps, 9);
});

test('boundary: one set below rep_max is not enough to add load', () => {
	const s = suggest([[set(185, 10), set(185, 10), set(185, 9)]], 6, 10, 'double', 5);
	assert.equal(s?.type, 'add_reps');
});

test('big dumbbell jump extends the rep range instead', () => {
	// 5 lb on a 30 lb press is 17% -> extend reps to rep_max + 3 first
	const s = suggest([[set(30, 10), set(30, 10)]], 6, 10, 'double', 5);
	assert.equal(s?.type, 'add_reps');
	assert.equal(s?.target_reps, 11);
	// ...and once the extended range is cleared, the jump is earned
	const earned = suggest([[set(30, 13), set(30, 13)]], 6, 10, 'double', 5);
	assert.equal(earned?.type, 'add_load');
	assert.equal(earned?.weight_lb, 35);
});

test('two sessions stuck under rep_min at the same load -> deload', () => {
	const s = suggest(
		[
			[set(225, 4), set(225, 3)],
			[set(225, 5), set(225, 4)]
		],
		6,
		10,
		'double',
		5
	);
	assert.equal(s?.type, 'deload');
	assert.ok((s?.weight_lb ?? 0) < 225);
});

test('one bad session is not a deload', () => {
	const s = suggest(
		[
			[set(225, 4)],
			[set(225, 8)]
		],
		6,
		10,
		'double',
		5
	);
	assert.equal(s?.type, 'add_reps');
});

test('bodyweight at top of range keeps adding reps', () => {
	const s = suggest([[set(0, 12), set(0, 12)]], 6, 12, 'double', 0);
	assert.equal(s?.type, 'add_reps');
	assert.equal(s?.target_reps, 13);
});

test('time progression beats last duration', () => {
	const hold: LoggedSet = { weight_lb: null, reps: null, duration_s: 60, is_warmup: false };
	const s = suggest([[hold]], 0, 0, 'time', 0);
	assert.equal(s?.type, 'beat_time');
	assert.equal(s?.target_duration_s, 66);
});

test('warmup sets never count', () => {
	const warm: LoggedSet = { weight_lb: 135, reps: 10, is_warmup: true, duration_s: null };
	const s = suggest([[warm, set(185, 10), set(185, 10), set(185, 10)]], 6, 10, 'double', 5);
	assert.equal(s?.type, 'add_load');
});

test('progression "none" stays silent', () => {
	assert.equal(suggest([[set(100, 10)]], 6, 10, 'none', 5), null);
});
