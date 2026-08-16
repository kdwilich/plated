import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankAlternatives, rankComplements } from './alternatives.ts';
import { forceCategory, matchesFilter, primaryGroups } from './filters.ts';
import type { Exercise, Measurement, MovementPattern } from './types.ts';

function ex(
	id: string,
	pattern: MovementPattern | null,
	equipment: string,
	muscles: string[],
	opts: { priority?: number; secondary?: string[]; measurement?: Measurement } = {}
): Exercise {
	return {
		id,
		name: id,
		measurement: opts.measurement ?? 'load_reps',
		movement_pattern: pattern,
		progression: 'double',
		equipment,
		primary_muscles: muscles,
		secondary_muscles: opts.secondary ?? [],
		unilateral: false,
		priority: opts.priority ?? 50
	};
}

const BENCH = ex('bench', 'horizontal_press', 'barbell', ['chest'], {
	priority: 100,
	secondary: ['triceps', 'shoulders']
});
const DB_BENCH = ex('db-bench', 'horizontal_press', 'dumbbell', ['chest'], { secondary: ['triceps'] });
const MACHINE_PRESS = ex('machine-press', 'horizontal_press', 'machine', ['chest']);
const FLY = ex('fly', 'chest_fly', 'dumbbell', ['chest']);
const ROW = ex('row', 'horizontal_pull', 'barbell', ['middle back'], { secondary: ['biceps'] });
const PUSHDOWN = ex('pushdown', 'triceps_extension', 'cable', ['triceps']);
const LATERAL = ex('lateral', 'lateral_raise', 'dumbbell', ['shoulders']);
const SQUAT = ex('squat', 'squat', 'barbell', ['quadriceps'], { secondary: ['glutes'] });
const RUN = ex('run', null, 'other', ['quadriceps'], { measurement: 'distance_time' });
const CURL = ex('curl', 'biceps_curl', 'dumbbell', ['biceps']);

const CATALOG = [BENCH, DB_BENCH, MACHINE_PRESS, FLY, ROW, PUSHDOWN, LATERAL, SQUAT, RUN, CURL];

test('force falls back to muscles when there is no pattern', () => {
	assert.equal(forceCategory(BENCH), 'push');
	assert.equal(forceCategory(ROW), 'pull');
	assert.equal(forceCategory(SQUAT), 'legs');
	// Unpatterned, so it can only be classified by what it trains.
	assert.equal(forceCategory(RUN), 'legs');
	assert.equal(forceCategory(ex('x', null, 'other', ['neck'])), 'pull');
	assert.equal(forceCategory(ex('y', null, 'other', ['nonsense'])), null);
});

test('group filter is primary-only', () => {
	// Bench works triceps, but searching "triceps" should not return presses.
	assert.deepEqual(primaryGroups(BENCH), ['chest']);
	assert.equal(matchesFilter(BENCH, { group: 'triceps' }), false);
	assert.equal(matchesFilter(PUSHDOWN, { group: 'triceps' }), true);
});

test('filters compose', () => {
	assert.equal(matchesFilter(DB_BENCH, { force: 'push', equipment: 'dumbbell' }), true);
	assert.equal(matchesFilter(DB_BENCH, { force: 'push', equipment: 'barbell' }), false);
	assert.equal(matchesFilter(DB_BENCH, {}), true);
});

test('alternatives lead with the same movement pattern', () => {
	const alts = rankAlternatives(BENCH, CATALOG);
	assert.ok(alts.slice(0, 2).every((a) => a.movement_pattern === 'horizontal_press'));
	assert.ok(!alts.some((a) => a.id === 'bench'), 'never suggests itself');
	assert.ok(!alts.some((a) => a.id === 'row'), 'a row is not a bench substitute');
});

test('alternatives prefer a different implement', () => {
	// Same pattern, same muscle, equal priority: the one that is not another
	// barbell wins, because the barbell is usually why you are swapping.
	const otherBar = ex('other-bar', 'horizontal_press', 'barbell', ['chest']);
	const alts = rankAlternatives(BENCH, [otherBar, MACHINE_PRESS]);
	assert.equal(alts[0].id, 'machine-press');
});

test('cardio is never a substitute for a lift', () => {
	// A run and a squat share "quadriceps" — only the measurement gate stops
	// this, and it has to be a gate rather than a low score.
	const alts = rankAlternatives(SQUAT, CATALOG);
	assert.ok(!alts.some((a) => a.id === 'run'));
});

test('alternatives respect the gym and the exclude list', () => {
	const alts = rankAlternatives(BENCH, CATALOG, {
		equipment: ['dumbbell'],
		exclude: ['db-bench']
	});
	assert.ok(!alts.some((a) => a.id === 'db-bench'), 'already in the session');
	// The gym has no machine. A pattern match you cannot perform loses to a
	// weaker match you can, so the dumbbell fly outranks the machine press.
	assert.ok(alts.indexOf(FLY) < alts.indexOf(MACHINE_PRESS));
});

test('complements fill the least-covered group in the session', () => {
	// Two chest movements and no direct triceps work — but every press in the
	// session hits triceps, so it counts as part of the day and it is starved.
	const picks = rankComplements([BENCH, DB_BENCH], CATALOG);
	assert.equal(picks[0].id, 'pushdown');
	assert.ok(picks.includes(FLY), 'chest still qualifies');
	assert.ok(picks.indexOf(FLY) > 0, '...but it is already covered twice');
});

test('an incidental secondary muscle is not what the day is about', () => {
	// The regression that only real data exposed: a barbell squat lists "lower
	// back" as a secondary. Counting that as an uncovered group scored it the
	// maximum, so leg day recommended deadlifts, good mornings and rows.
	const SQUAT_REAL = ex('squat-real', 'squat', 'barbell', ['quadriceps'], {
		secondary: ['glutes', 'hamstrings', 'calves', 'lower back']
	});
	const CURLS = ex('leg-curl', 'leg_curl', 'machine', ['hamstrings']);
	const CALVES = ex('calf', 'calf_raise', 'machine', ['calves']);
	const DEADLIFT = ex('deadlift', 'hip_hinge', 'barbell', ['lower back'], {
		priority: 100,
		secondary: ['hamstrings', 'glutes']
	});

	const picks = rankComplements([SQUAT_REAL, CURLS, CALVES], [...CATALOG, DEADLIFT]);
	assert.ok(!picks.some((p) => p.id === 'deadlift'), 'back is a stabilizer here, not a target');
	assert.ok(!picks.some((p) => p.id === 'row'));
	assert.ok(picks.length > 0 && picks.every((p) => forceCategory(p) === 'legs'));
});

test('complements stay inside the day', () => {
	const picks = rankComplements([BENCH, DB_BENCH], CATALOG);
	assert.ok(!picks.some((p) => p.id === 'squat'), 'no leg work on a push day');
	assert.ok(!picks.some((p) => p.id === 'curl'), 'no biceps work on a push day');
	assert.ok(!picks.some((p) => p.id === 'run'), 'nothing unpatterned');
});

test('complements never repeat what is already in the session', () => {
	const picks = rankComplements([BENCH, PUSHDOWN], CATALOG);
	assert.ok(!picks.some((p) => p.id === 'bench' || p.id === 'pushdown'));
});

test('an empty session has nothing to recommend from', () => {
	// A freestyle workout before the first exercise: filters only, by design.
	assert.deepEqual(rankComplements([], CATALOG), []);
});

test('ranking is deterministic', () => {
	const a = rankAlternatives(BENCH, CATALOG).map((e) => e.id);
	const b = rankAlternatives(BENCH, [...CATALOG].reverse()).map((e) => e.id);
	assert.deepEqual(a, b);
});
