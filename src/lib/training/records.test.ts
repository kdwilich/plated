import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestRecords, epley, plateEquivalent, type RecordSet } from './records.ts';

const set = (o: Partial<RecordSet> & { completed_at: string }): RecordSet => ({
	weight_lb: null,
	reps: null,
	duration_s: null,
	distance_m: null,
	...o
});

test('epley ranks more reps above a heavier single', () => {
	// 225x5 is 262.5; 245x1 is 253.2. That ordering is the whole reason the
	// formula is here rather than a bare MAX(weight).
	assert.equal(epley(225, 5), 262.5);
	assert.ok(epley(225, 5) > epley(245, 1));
});

test('epley on a single rep is barely above the weight', () => {
	assert.equal(Math.round(epley(300, 1) * 100) / 100, 310);
});

test('a loaded lift yields heaviest, est. 1RM and best set, in that order', () => {
	const recs = bestRecords(
		[set({ weight_lb: 185, reps: 8, completed_at: '2026-03-04T18:00:00Z' })],
		'load_reps'
	);
	assert.deepEqual(
		recs.map((r) => r.kind),
		['heaviest', 'e1rm', 'best_set']
	);
});

test('the heaviest set and the best estimated 1RM can be different sets', () => {
	const heavy = set({ weight_lb: 245, reps: 1, completed_at: '2026-03-01T18:00:00Z' });
	const volume = set({ weight_lb: 225, reps: 5, completed_at: '2026-03-08T18:00:00Z' });
	const recs = bestRecords([heavy, volume], 'load_reps');
	const by = Object.fromEntries(recs.map((r) => [r.kind, r]));
	assert.equal(by.heaviest.set.weight_lb, 245);
	assert.equal(by.e1rm.set.weight_lb, 225);
	assert.equal(by.best_set.set.weight_lb, 225);
});

test('a rep-only lift records reps and nothing else', () => {
	const recs = bestRecords(
		[
			set({ reps: 12, completed_at: '2026-03-01T18:00:00Z' }),
			set({ reps: 15, completed_at: '2026-03-08T18:00:00Z' })
		],
		'reps_only'
	);
	assert.deepEqual(
		recs.map((r) => r.kind),
		['most_reps']
	);
	assert.equal(recs[0].value, 15);
});

test('a timed hold records its longest', () => {
	const recs = bestRecords(
		[
			set({ duration_s: 90, completed_at: '2026-03-01T18:00:00Z' }),
			set({ duration_s: 180, completed_at: '2026-03-08T18:00:00Z' })
		],
		'time'
	);
	assert.deepEqual(
		recs.map((r) => r.kind),
		['longest']
	);
	assert.equal(recs[0].value, 180);
});

test('a loaded hold records both the load and the hold', () => {
	const recs = bestRecords(
		[set({ weight_lb: 70, duration_s: 45, completed_at: '2026-03-01T18:00:00Z' })],
		'load_time'
	);
	assert.deepEqual(
		recs.map((r) => r.kind),
		['heaviest', 'longest']
	);
});

test('a distance lift records furthest and longest', () => {
	const recs = bestRecords(
		[set({ distance_m: 5000, duration_s: 1500, completed_at: '2026-03-01T18:00:00Z' })],
		'distance_time'
	);
	assert.deepEqual(
		recs.map((r) => r.kind),
		['furthest', 'longest']
	);
});

test('no sets means no records rather than zeroes', () => {
	assert.deepEqual(bestRecords([], 'load_reps'), []);
});

test('a set missing the metric does not become a zero record', () => {
	// A bodyweight pull-up logs no weight. It must not register as a 0 lb PR.
	const recs = bestRecords(
		[set({ weight_lb: null, reps: 12, completed_at: '2026-03-01T18:00:00Z' })],
		'load_reps'
	);
	assert.deepEqual(
		recs.map((r) => r.kind),
		[]
	);
});

test('a tie belongs to the set that got there first', () => {
	const later = set({ weight_lb: 225, reps: 5, completed_at: '2026-03-08T18:00:00Z' });
	const earlier = set({ weight_lb: 225, reps: 5, completed_at: '2026-03-01T18:00:00Z' });
	// Order in, order out must not matter: repeating a record is not setting one.
	for (const input of [
		[later, earlier],
		[earlier, later]
	]) {
		const recs = bestRecords(input, 'load_reps');
		assert.equal(recs[0].set.completed_at, '2026-03-01T18:00:00Z');
	}
});

test('tonnage converts to forty-fives', () => {
	assert.equal(plateEquivalent(45_000), 1000);
	assert.equal(plateEquivalent(0), 0);
});
