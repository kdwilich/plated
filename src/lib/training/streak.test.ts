import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketByLocalDay, currentStreak, localDay } from './streak.ts';

/** An independent oracle. en-CA renders YYYY-MM-DD, and it goes through a
 *  different code path than the implementation, so a naive `iso.slice(0, 10)`
 *  fails this on any machine not set to UTC. */
const oracle = (iso: string) => new Date(iso).toLocaleDateString('en-CA');

test('a timestamp buckets to its local day, not its UTC day', () => {
	// 23:30 somewhere behind UTC is already tomorrow in UTC. Whichever zone
	// the test machine is in, the answer must match what a person there would
	// call that evening.
	const iso = '2026-03-04T23:30:00-08:00';
	assert.deepEqual(bucketByLocalDay([iso]), [oracle(iso)]);
});

test('two sessions on one day are one day', () => {
	const morning = '2026-03-04T14:00:00Z';
	const evening = '2026-03-04T15:00:00Z';
	assert.deepEqual(bucketByLocalDay([morning, evening]), [oracle(morning)]);
});

test('days come back oldest first', () => {
	const days = bucketByLocalDay(['2026-03-08T18:00:00Z', '2026-03-01T18:00:00Z']);
	assert.deepEqual(days, [...days].sort());
});

test('unparseable timestamps are dropped rather than becoming NaN days', () => {
	assert.deepEqual(bucketByLocalDay(['not a date']), []);
});

test('localDay pads month and day', () => {
	assert.equal(localDay(new Date(2026, 0, 5)), '2026-01-05');
});

test('consecutive trained weeks count', () => {
	// Thursday 2026-03-05, and the two Mondays before it.
	const today = new Date(2026, 2, 5);
	assert.equal(currentStreak(['2026-02-23', '2026-03-02'], today), 2);
});

test('a skipped week breaks the streak', () => {
	const today = new Date(2026, 2, 5);
	// 2026-02-16 week, nothing in the 2026-02-23 week, then this week.
	assert.equal(currentStreak(['2026-02-16', '2026-03-02'], today), 1);
});

test('the current week not yet trained is grace, not a break', () => {
	// Monday morning must not read as a broken streak.
	const monday = new Date(2026, 2, 2);
	assert.equal(currentStreak(['2026-02-23', '2026-02-16'], monday), 2);
});

test('two untrained weeks is a broken streak', () => {
	const today = new Date(2026, 2, 5);
	assert.equal(currentStreak(['2026-02-16'], today), 0);
});

test('no history is no streak', () => {
	assert.equal(currentStreak([], new Date(2026, 2, 5)), 0);
});

test('a week is Monday to Sunday', () => {
	// Sunday 2026-03-01 and Monday 2026-03-02 are different weeks, so a lifter
	// who trained on both has a two-week streak, not a one-week one.
	const today = new Date(2026, 2, 5);
	assert.equal(currentStreak(['2026-03-01', '2026-03-02'], today), 2);
});
