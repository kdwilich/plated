import { test } from 'node:test';
import assert from 'node:assert/strict';
// Imports grow cycle by cycle. Under Node ESM a named import of a missing
// export is a load-time SyntaxError, so importing everything up front would
// keep the whole file red until the last cycle and hide each green.
import {
	fmtClock,
	fmtMiles,
	fmtPace,
	isRunType,
	metres,
	miles,
	paceSecPerMi,
	parseClock,
	parseRunForm,
	runLabel,
	runLine,
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
