import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, roundToLoadable, smallestBarbellJump, plateColor } from './plates.ts';
import type { PlateStock } from './types.ts';

const FULL: PlateStock[] = [
	{ denomination_lb: 45, pairs: 10 },
	{ denomination_lb: 35, pairs: 2 },
	{ denomination_lb: 25, pairs: 2 },
	{ denomination_lb: 10, pairs: 4 },
	{ denomination_lb: 5, pairs: 2 },
	{ denomination_lb: 2.5, pairs: 2 }
];

test('solves an exact classic load', () => {
	const s = solve(225, 45, FULL);
	assert.deepEqual(s.perSide, [45, 45]);
	assert.equal(s.achievedLb, 225);
	assert.equal(s.exact, true);
});

test('mixes denominations, heaviest first', () => {
	const s = solve(195, 45, FULL);
	assert.deepEqual(s.perSide, [45, 25, 5]);
	assert.equal(s.achievedLb, 195);
});

test('incomplete plate set: returns nearest achievable, never a fantasy number', () => {
	// No 2.5s or 5s: 197 is unreachable; 195 is the truth.
	const coarse: PlateStock[] = [
		{ denomination_lb: 45, pairs: 4 },
		{ denomination_lb: 25, pairs: 2 },
		{ denomination_lb: 10, pairs: 2 }
	];
	const s = solve(197, 45, coarse);
	assert.equal(s.achievedLb, 185);
	assert.equal(s.exact, false);
	assert.ok(s.achievedLb <= 197);
});

test('limited pairs are respected', () => {
	const one45: PlateStock[] = [{ denomination_lb: 45, pairs: 1 }];
	const s = solve(315, 45, one45);
	assert.deepEqual(s.perSide, [45]);
	assert.equal(s.achievedLb, 135);
});

test('target at or below the bar returns the empty bar', () => {
	assert.deepEqual(solve(45, 45, FULL).perSide, []);
	assert.equal(solve(30, 45, FULL).achievedLb, 45);
});

test('roundToLoadable never rounds up past the target', () => {
	assert.equal(roundToLoadable(226, 45, FULL), 225);
});

test('smallest jump comes from the smallest plate', () => {
	assert.equal(smallestBarbellJump(FULL), 5);
	assert.equal(smallestBarbellJump([{ denomination_lb: 45, pairs: 10 }]), 90);
});

test('every canonical denomination has a color', () => {
	for (const d of [55, 45, 35, 25, 10, 5, 2.5]) {
		assert.match(plateColor(d), /^#[0-9a-f]{6}$/);
	}
});
