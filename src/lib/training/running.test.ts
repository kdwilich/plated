import { test } from 'node:test';
import assert from 'node:assert/strict';
// Imports grow cycle by cycle. Under Node ESM a named import of a missing
// export is a load-time SyntaxError, so importing everything up front would
// keep the whole file red until the last cycle and hide each green.
import {
	biggestWeek,
	fmtClock,
	fmtMiles,
	fmtPace,
	isRunType,
	longestRun,
	metres,
	miles,
	paceSecPerMi,
	parseClock,
	parseRunForm,
	runLabel,
	runLine,
	spikeCap,
	spikeLine,
	standardRecords,
	weeklyMiles,
	weekSoFar
} from './running.ts';

test('a mile is 1609.344 m, both ways', () => {
	assert.equal(metres(1), 1609.344);
	assert.equal(Math.round(miles(5000) * 1000) / 1000, 3.107);
});

test('pace is seconds per mile, null when either side is missing or zero', () => {
	// 5K in 24:30 is 7:53/mi.
	assert.equal(Math.round(paceSecPerMi(5000, 1470)!), 473);
	assert.equal(paceSecPerMi(null, 1470), null);
	assert.equal(paceSecPerMi(5000, null), null);
	assert.equal(paceSecPerMi(0, 1470), null);
	assert.equal(paceSecPerMi(5000, 0), null);
});

test('pace and clock format with padded seconds, and the clock crosses the hour', () => {
	assert.equal(fmtPace(473), '7:53');
	assert.equal(fmtPace(600), '10:00');
	assert.equal(fmtClock(1470), '24:30');
	assert.equal(fmtClock(3725), '1:02:05');
	assert.equal(fmtClock(45), '0:45');
	assert.equal(fmtMiles(5000), '3.11');
});

test('the clock accepts m:ss, h:mm:ss and bare seconds', () => {
	assert.equal(parseClock('24:30'), 1470);
	assert.equal(parseClock('1:02:05'), 3725);
	assert.equal(parseClock('45'), 45);
	assert.equal(parseClock(' 24:30 '), 1470);
});

test('the clock rejects what a clock cannot show', () => {
	assert.equal(parseClock('1:75'), null); // seventy-five seconds
	assert.equal(parseClock('1:60:00'), null);
	assert.equal(parseClock('-5'), null);
	assert.equal(parseClock(''), null);
	assert.equal(parseClock('abc'), null);
	assert.equal(parseClock('1:2:3:4'), null);
	assert.equal(parseClock('0'), null); // a zero-length run is not a run
});

test('the form yields metres and seconds, or a reason a person can act on', () => {
	assert.deepEqual(parseRunForm({ miles: '3.1', clock: '24:30' }), {
		ok: true,
		distance_m: Math.round(3.1 * 1609.344),
		duration_s: 1470
	});
	assert.deepEqual(parseRunForm({ miles: '', clock: '24:30' }), { ok: false, error: 'How far?' });
	assert.deepEqual(parseRunForm({ miles: '0', clock: '24:30' }), { ok: false, error: 'How far?' });
	assert.deepEqual(parseRunForm({ miles: 'x', clock: '24:30' }), { ok: false, error: 'How far?' });
	assert.deepEqual(parseRunForm({ miles: '3.1', clock: '' }), { ok: false, error: 'How long? m:ss or h:mm:ss' });
	assert.deepEqual(parseRunForm({ miles: '3.1', clock: '1:75' }), { ok: false, error: 'How long? m:ss or h:mm:ss' });
});

test('run types are the five the form offers, and nothing else', () => {
	for (const t of ['easy', 'long', 'tempo', 'intervals', 'race']) assert.ok(isRunType(t), t);
	assert.equal(isRunType('jog'), false);
	assert.equal(isRunType(null), false);
	assert.equal(isRunType(3), false);
});

test('run labels read as a person would say them', () => {
	assert.equal(runLabel('easy'), 'Easy run');
	assert.equal(runLabel('long'), 'Long run');
	assert.equal(runLabel('tempo'), 'Tempo run');
	assert.equal(runLabel('intervals'), 'Intervals');
	assert.equal(runLabel('race'), 'Race');
});

test('a set line is distance, time and pace, dropping whatever is missing', () => {
	assert.equal(runLine(5000, 1470), '3.11 mi · 24:30 · 7:53/mi');
	assert.equal(runLine(5000, null), '3.11 mi');
	assert.equal(runLine(null, 1470), '24:30');
	assert.equal(runLine(null, null), '');
});

// Local timestamps built the way the browser would see them, so the week
// boundary is tested in whatever zone the test machine is in.
const local = (y: number, mo: number, d: number, h = 9) => new Date(y, mo - 1, d, h).toISOString();

test('the week strip counts lifts and runs since Monday and sums the miles', () => {
	// 2026-11-09 is a Monday. "Today" is the Wednesday.
	const today = new Date(2026, 10, 11, 20);
	const rows = [
		{ started_at: local(2026, 11, 8, 18), run_type: 'long', distance_m: 16093 }, // Sunday: last week
		{ started_at: local(2026, 11, 9), run_type: null, distance_m: 0 },
		{ started_at: local(2026, 11, 10), run_type: 'easy', distance_m: 5000 },
		{ started_at: local(2026, 11, 11), run_type: 'easy', distance_m: 6437 },
		{ started_at: local(2026, 11, 11, 19), run_type: null, distance_m: 0 }
	];
	const week = weekSoFar(rows, today);
	assert.equal(week.lifts, 2);
	assert.equal(week.runs, 2);
	assert.equal(Math.round(week.miles * 100) / 100, 7.11);
});

test('a run without a distance is still a run, and an unstarted week is zeros', () => {
	const today = new Date(2026, 10, 9, 8); // Monday morning
	assert.deepEqual(weekSoFar([], today), { lifts: 0, runs: 0, miles: 0 });
	const week = weekSoFar([{ started_at: local(2026, 11, 9, 7), run_type: 'easy', distance_m: null }], today);
	assert.deepEqual(week, { lifts: 0, runs: 1, miles: 0 });
});

// --- Run insight -----------------------------------------------------------

let n = 0;
/** One set of a run. Its own workout unless `workout_id` says otherwise. */
const set = (
	started_at: string,
	distance_m: number,
	duration_s: number | null = null,
	extra: { workout_id?: string; is_warmup?: number } = {}
) => ({ workout_id: extra.workout_id ?? `w${n++}`, started_at, distance_m, duration_s, is_warmup: extra.is_warmup ?? 0 });

const r2 = (x: number) => Math.round(x * 100) / 100;

test('weekly miles are local Monday weeks, oldest first, zero-filled', () => {
	const today = new Date(2026, 10, 11, 20); // Wednesday; Monday is Nov 9
	const rows = [
		set(local(2026, 11, 8, 22), 16093.44), // Sunday night: last week
		set(local(2026, 11, 9, 6), 8046.72), // Monday morning: this week
		set(local(2026, 11, 10, 6), 1609.344, 600, { workout_id: 'iv', is_warmup: 1 }), // warm-up counts
		set(local(2026, 11, 10, 6), 3218.688, 900, { workout_id: 'iv' }),
		set(local(2026, 10, 20, 9), 4828.032), // three weeks back
		set(local(2026, 6, 1, 9), 99999) // older than the window
	];
	const w = weeklyMiles(rows, today, 4).map(r2);
	assert.deepEqual(w, [3, 0, 10, 8]);
	assert.equal(weeklyMiles(rows, today).length, 12);
	assert.deepEqual(weeklyMiles([], today, 3), [0, 0, 0]);
});

test('the spike cap is 10% past the longest run of the last 30 days', () => {
	const now = new Date(2026, 10, 11, 20);
	const rows = [
		set(local(2026, 10, 10, 9), 20000), // 32 days ago: outside
		set(local(2026, 10, 20, 9), 8000),
		// One run in two sets is one run of 10 km.
		set(local(2026, 11, 2, 9), 4000, 1200, { workout_id: 'a', is_warmup: 1 }),
		set(local(2026, 11, 2, 9), 6000, 1800, { workout_id: 'a' })
	];
	const cap = spikeCap(rows, now)!;
	assert.equal(cap.longest_m, 10000);
	assert.equal(Math.round(cap.cap_m), 11000);
	assert.equal(spikeLine({ longest_m: metres(6.5), cap_m: metres(7.15) }), 'Longest in 30 days is 6.5. Past 7.2 is a spike.');
	assert.equal(spikeCap([rows[0]], now), null);
	assert.equal(spikeCap([], now), null);
});

test('a set within -2% / +4% of a standard distance holds its record, scaled', () => {
	const day = local(2026, 11, 4);
	// The band edges for a 5K: 4900 and 5200 are in, a metre past either is out.
	assert.equal(standardRecords([set(day, 4900, 1500)]).length, 1);
	assert.equal(standardRecords([set(day, 5200, 1500)]).length, 1);
	assert.equal(standardRecords([set(day, 4899, 1500)]).length, 0);
	assert.equal(standardRecords([set(day, 5201, 1500)]).length, 0);

	const [rec] = standardRecords([set(day, 5100, 1530)]);
	assert.equal(rec.key, '5k');
	assert.equal(rec.label, '5K');
	assert.equal(rec.time_s, 1500); // 1530 s over 5100 m is 1500 s over 5000 m
	assert.equal(rec.distance_m, 5100); // the real set rides along
	assert.equal(rec.duration_s, 1530);
	assert.equal(rec.started_at, day);
});

test('the fastest set wins, warm-ups and untimed sets never do, in distance order', () => {
	const rows = [
		set(local(2026, 11, 1), 10000, 3000),
		set(local(2026, 11, 2), 5000, 1500),
		set(local(2026, 11, 3), 5000, 1440),
		set(local(2026, 11, 4), 5000, 1200, { is_warmup: 1 }),
		set(local(2026, 11, 5), 5000, null),
		set(local(2026, 11, 6), 5000, 0),
		set(local(2026, 11, 7), 1609.344, 400)
	];
	const recs = standardRecords(rows);
	assert.deepEqual(recs.map((r) => r.key), ['mile', '5k', '10k']);
	assert.equal(recs[1].time_s, 1440);
	assert.equal(recs[1].started_at, local(2026, 11, 3));
	assert.deepEqual(standardRecords([]), []);
});

test('the longest run sums a workout, and the biggest week is named by its Monday', () => {
	const rows = [
		set(local(2026, 11, 2, 9), 4000, null, { workout_id: 'a', is_warmup: 1 }),
		set(local(2026, 11, 2, 9), 6000, null, { workout_id: 'a' }),
		set(local(2026, 11, 4, 9), 9000),
		set(local(2026, 11, 8, 22), 3000), // Sunday night, still the week of Nov 2
		set(local(2026, 11, 9, 6), 16093.44) // Monday: the week of Nov 9
	];
	const longest = longestRun(rows)!;
	assert.equal(Math.round(longest.distance_m), 16093);
	assert.equal(longest.started_at, local(2026, 11, 9, 6));
	const big = biggestWeek(rows)!;
	assert.equal(big.monday, '2026-11-02');
	assert.equal(r2(big.miles), r2(22000 / 1609.344));
	assert.equal(longestRun([]), null);
	assert.equal(biggestWeek([]), null);
});
