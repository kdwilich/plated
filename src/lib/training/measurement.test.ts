import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowsNegativeLoad, usesLoad, usesReps, usesTime } from './measurement.ts';

// The five measurements the schema's CHECK constraint allows, and the inputs
// each one earns. load_time is the awkward one: it takes both a weight and a
// clock, so it must answer true to usesLoad AND usesTime.
const TABLE: Record<string, { load: boolean; reps: boolean; time: boolean }> = {
	load_reps: { load: true, reps: true, time: false },
	reps_only: { load: false, reps: true, time: false },
	time: { load: false, reps: false, time: true },
	load_time: { load: true, reps: false, time: true },
	distance_time: { load: false, reps: false, time: true }
};

test('every measurement gets the right inputs', () => {
	for (const [m, want] of Object.entries(TABLE)) {
		assert.equal(usesLoad(m), want.load, `${m} usesLoad`);
		assert.equal(usesReps(m), want.reps, `${m} usesReps`);
		assert.equal(usesTime(m), want.time, `${m} usesTime`);
	}
});

test('negative load is only for bodyweight work that carries a load', () => {
	assert.equal(allowsNegativeLoad('body only', 'load_reps'), true);
	// A bodyweight exercise with no load axis has nothing to go negative.
	assert.equal(allowsNegativeLoad('body only', 'reps_only'), false);
	// A loaded barbell cannot weigh less than nothing.
	assert.equal(allowsNegativeLoad('barbell', 'load_reps'), false);
	assert.equal(allowsNegativeLoad(null, 'load_reps'), false);
});
