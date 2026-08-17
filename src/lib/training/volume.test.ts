import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actualSetsByGroup, type TrainedExercise } from './volume.ts';

const trained = (o: Partial<TrainedExercise>): TrainedExercise => ({
	primary_muscles: [],
	secondary_muscles: [],
	movement_pattern: 'horizontal_press',
	sets: 3,
	...o
});

test('primary muscles count full', () => {
	const vol = actualSetsByGroup([trained({ primary_muscles: ['chest'], sets: 4 })]);
	assert.equal(vol.chest, 4);
});

test('secondary muscles count half', () => {
	// A bench press is real triceps work and pretending otherwise misleads the
	// table — the same rule weeklySetsByGroup applies to the plan.
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['chest'], secondary_muscles: ['triceps'], sets: 4 })
	]);
	assert.equal(vol.chest, 4);
	assert.equal(vol.triceps, 2);
});

test('muscles collapse into the groups a lifter thinks in', () => {
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['lats'], sets: 3 }),
		trained({ primary_muscles: ['middle back'], sets: 3 })
	]);
	assert.equal(vol.back, 6);
});

test('exercises with no movement pattern score nothing', () => {
	// Cardio and unpatterned oddities are excluded from volume, exactly as they
	// are from the plan. They still appear in the drill-down under Other.
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['quadriceps'], movement_pattern: null, sets: 5 })
	]);
	assert.deepEqual(vol, {});
});

test('half sets round to the nearest half rather than drifting', () => {
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['chest'], secondary_muscles: ['triceps'], sets: 3 })
	]);
	assert.equal(vol.triceps, 1.5);
});

test('an unmapped muscle is skipped rather than becoming its own group', () => {
	const vol = actualSetsByGroup([trained({ primary_muscles: ['spleen'], sets: 3 })]);
	assert.deepEqual(vol, {});
});

test('nothing trained is an empty table', () => {
	assert.deepEqual(actualSetsByGroup([]), {});
});
