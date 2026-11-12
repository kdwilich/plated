import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CHAINS, chainOf, areNeighbours, placeLabel, suggestChain, type ChainInput } from './chains.ts';
import type { LoggedSet } from './types.ts';

// The rungs are catalog rows, synthetic ones included, so they are checked
// against the seed a fresh database gets rather than the raw dataset.
const d1 = (p: string) => readFileSync(new URL(`../../../d1/${p}`, import.meta.url), 'utf8');
const db = new DatabaseSync(':memory:');
db.exec(d1('schema.sql'));
for (const m of readdirSync(new URL('../../../d1/migrations', import.meta.url)).sort()) db.exec(d1(`migrations/${m}`));
db.exec(d1('seed.sql'));
type Row = { name: string; requires_bar: number; progression: string; movement_pattern: string | null; equipment: string };
const row = (id: string) => db.prepare('SELECT * FROM exercise WHERE id = ?').get(id) as Row | undefined;

test('every rung is a seeded bodyweight row with the same name, bar and a pattern', () => {
	for (const chain of CHAINS) {
		for (const rung of chain.rungs) {
			const r = row(rung.exercise_id);
			assert.ok(r, `${chain.key}: ${rung.exercise_id} missing from the seed`);
			assert.equal(r.name, rung.name, rung.exercise_id);
			assert.equal(r.requires_bar, rung.bar ? 1 : 0, `${rung.exercise_id} bar`);
			assert.equal(r.equipment, 'body only', rung.exercise_id);
			assert.ok(r.movement_pattern, `${rung.exercise_id} earns no volume without a pattern`);
		}
	}
});

test('a chain progresses one way, and an exercise sits in at most one chain', () => {
	const seen = new Set<string>();
	for (const chain of CHAINS) {
		assert.ok(chain.rungs.length >= 2, chain.key);
		const kinds = new Set(chain.rungs.map((r) => row(r.exercise_id)!.progression));
		assert.deepEqual([...kinds], [chain.unit === 'seconds' ? 'time' : 'double'], chain.key);
		chain.rungs.forEach((rung, i) => {
			assert.ok(!seen.has(rung.exercise_id), `${rung.exercise_id} is in two chains`);
			seen.add(rung.exercise_id);
			const top = i === chain.rungs.length - 1;
			if (top) assert.equal(rung.target, undefined, `${rung.exercise_id}: the top rung has no target`);
			else assert.ok(rung.target && rung.target > 0, `${rung.exercise_id} needs a target`);
		});
	}
});

test('rungs know their place and neighbours', () => {
	const p = chainOf('Pushups')!;
	assert.equal(placeLabel(p), 'PUSH · 2/5');
	assert.equal(p.up?.exercise_id, 'Push-Ups_With_Feet_Elevated');
	assert.equal(p.down?.exercise_id, 'Incline_Push-Up');
	assert.equal(chainOf('Barbell_Squat'), null);
	assert.ok(areNeighbours('Pushups', 'Incline_Push-Up'));
	assert.ok(areNeighbours('Pushups', 'Push-Ups_With_Feet_Elevated'));
	assert.ok(!areNeighbours('Incline_Push-Up', 'bw-archer-push-up'), 'two rungs is not a step');
	assert.ok(!areNeighbours('Pushups', 'Chin-Up'), 'different chains');
	assert.ok(!areNeighbours('Barbell_Squat', 'Pushups'));
});

const reps = (...r: number[]): LoggedSet[] => r.map((n) => ({ weight_lb: null, reps: n, duration_s: null, is_warmup: false }));
const net = (w: number, ...r: number[]): LoggedSet[] => r.map((n) => ({ weight_lb: w, reps: n, duration_s: null, is_warmup: false }));
const holds = (...s: number[]): LoggedSet[] => s.map((n) => ({ weight_lb: null, reps: null, duration_s: n, is_warmup: false }));

const input = (exercise_id: string, sessions: LoggedSet[][], over: Partial<ChainInput> = {}): ChainInput => ({
	exercise_id,
	sessions,
	target_sets: 3,
	rep_min: 8,
	rep_max: 12,
	kind: 'double',
	increment_lb: 0,
	is_net_load: false,
	uses_load: false,
	has_bar: true,
	...over
});

test('move up after two sessions at the target on every set, not after one', () => {
	const once = suggestChain(input('Pushups', [reps(15, 15, 15), reps(15, 14, 12)]));
	assert.equal(once.step, null);
	const twice = suggestChain(input('Pushups', [reps(15, 15, 16), reps(16, 15, 15)]));
	assert.equal(twice.step?.direction, 'up');
	assert.equal(twice.step?.rung.exercise_id, 'Push-Ups_With_Feet_Elevated');
	// The ordinary suggestion still comes back for the inputs.
	assert.equal(twice.suggestion?.type, 'add_reps');
});

test('too few sets is not a graduation', () => {
	const r = suggestChain(input('Pushups', [reps(15, 15), reps(15, 15, 15)]));
	assert.equal(r.step, null);
});

test('warm-ups do not count toward graduation', () => {
	const warm = { weight_lb: null, reps: 5, duration_s: null, is_warmup: true };
	const r = suggestChain(input('Pushups', [[warm, ...reps(15, 15, 15)], [warm, ...reps(15, 15, 15)]]));
	assert.equal(r.step?.direction, 'up');
});

test('no step up onto a bar the gym lacks', () => {
	const r = suggestChain(input('Bench_Dips', [reps(15, 15, 15), reps(15, 15, 15)], { has_bar: false }));
	assert.equal(r.step, null);
	assert.match(r.suggestion?.note ?? '', /needs a bar/);
	const ok = suggestChain(input('Bench_Dips', [reps(15, 15, 15), reps(15, 15, 15)]));
	assert.equal(ok.step?.rung.exercise_id, 'Dips_-_Triceps_Version');
});

test('assisted reps are not a graduation; added weight is', () => {
	const assisted = suggestChain(input('Chin-Up', [net(-30, 12, 12, 12), net(-30, 12, 12, 12)], { uses_load: true, is_net_load: true, increment_lb: 10 }));
	assert.equal(assisted.step, null);
	assert.equal(assisted.suggestion?.type, 'add_load', 'less assistance, as before');
	const bw = suggestChain(input('Chin-Up', [net(0, 10, 10, 10), net(0, 11, 10, 10)], { uses_load: true, is_net_load: true, increment_lb: 10 }));
	assert.equal(bw.step?.rung.exercise_id, 'Pullups');
});

test('move down after two short first sets at bodyweight', () => {
	const r = suggestChain(input('Push-Ups_With_Feet_Elevated', [reps(5, 4, 4), reps(6, 5, 4)]));
	assert.equal(r.step?.direction, 'down');
	assert.equal(r.step?.rung.exercise_id, 'Pushups');
	const once = suggestChain(input('Push-Ups_With_Feet_Elevated', [reps(5, 4, 4), reps(9, 8, 8)]));
	assert.equal(once.step, null);
	// The bottom rung has nowhere to go.
	assert.equal(suggestChain(input('Incline_Push-Up', [reps(3, 3, 3), reps(3, 3, 3)])).step, null);
});

test('assisted work keeps the existing deload instead of a step down', () => {
	const r = suggestChain(input('Pullups', [net(-20, 5, 4, 4), net(-20, 6, 5, 4)], { uses_load: true, is_net_load: true, increment_lb: 10 }));
	assert.equal(r.step, null);
	assert.equal(r.suggestion?.type, 'deload');
});

test('the top rung progresses the way it always did', () => {
	const r = suggestChain(input('Pullups', [net(0, 12, 12, 12), net(0, 12, 12, 12)], { uses_load: true, is_net_load: true, increment_lb: 10 }));
	assert.equal(r.step, null);
	assert.equal(r.suggestion?.type, 'add_load');
	assert.equal(r.suggestion?.weight_lb, 10);
});

test('time chains graduate on seconds and step down under the hold floor', () => {
	const t = { kind: 'time' as const };
	const up = suggestChain(input('bw-tuck-l-sit', [holds(20, 22, 20), holds(21, 20, 20)], t));
	assert.equal(up.step?.rung.exercise_id, 'bw-l-sit');
	const down = suggestChain(input('bw-l-sit', [holds(6, 5, 4), holds(8, 6, 5)], t));
	assert.equal(down.step?.rung.exercise_id, 'bw-tuck-l-sit');
	assert.equal(suggestChain(input('bw-l-sit', [holds(12, 10, 9), holds(11, 10, 8)], t)).step, null);
});

test('a fresh rung asks for reps, not a weight', () => {
	const r = suggestChain(input('bw-archer-push-up', []));
	assert.equal(r.suggestion?.type, 'start');
	assert.match(r.suggestion?.note ?? '', /8–12 clean reps/);
	assert.doesNotMatch(r.suggestion?.note ?? '', /weight/);
});

test('an exercise outside every chain is plain suggest()', () => {
	const r = suggestChain(input('Barbell_Squat', [net(225, 12, 12, 12)], { uses_load: true, increment_lb: 5 }));
	assert.equal(r.step, null);
	assert.equal(r.suggestion?.type, 'add_load');
});
