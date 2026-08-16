import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mobility, MOBILITY_EXERCISE_IDS } from './mobility.ts';
import type { MovementPattern } from './types.ts';

const FULL_BODY: MovementPattern[] = [
	'squat',
	'hip_thrust',
	'horizontal_press',
	'vertical_pull',
	'lateral_raise',
	'biceps_curl'
];

const LEG_DRILLS = [
	'Sit_Squats',
	'Ankle_Circles',
	'Inchworm',
	'Front_Leg_Raises',
	'Kneeling_Hip_Flexor'
];

test('the cardio opener is always first and never links to a guide', () => {
	for (const patterns of [[], FULL_BODY, ['squat'] as MovementPattern[]]) {
		const list = mobility(patterns);
		assert.equal(list[0].exercise_id, null);
		assert.match(list[0].name, /cardio/i);
	}
});

test('an empty session still gets the always-on drills', () => {
	const ids = mobility([]).map((d) => d.exercise_id);
	assert.deepEqual(ids, [null, 'Cat_Stretch', 'Standing_Hip_Circles']);
});

test('a full body session is capped at six drills and covers both regions', () => {
	const drills = mobility(FULL_BODY).filter((d) => d.exercise_id !== null);
	assert.equal(drills.length, 6, 'opener excluded, always-on included');

	const ids = new Set(drills.map((d) => d.exercise_id));
	const upper = [
		'Dynamic_Chest_Stretch',
		'Arm_Circles',
		'Shoulder_Circles',
		'Dynamic_Back_Stretch',
		'Elbows_Back'
	];
	assert.ok(LEG_DRILLS.some((id) => ids.has(id)), 'no lower-body drill survived the cap');
	assert.ok(upper.some((id) => ids.has(id)), 'no upper-body drill survived the cap');
});

test('a pull-only session gets no leg drills beyond the always-on pair', () => {
	const ids = mobility(['vertical_pull', 'horizontal_pull', 'biceps_curl']).map(
		(d) => d.exercise_id
	);
	for (const legOnly of LEG_DRILLS) {
		assert.ok(!ids.includes(legOnly), `${legOnly} has no business on a pull day`);
	}
	assert.ok(ids.includes('Dynamic_Back_Stretch'));
});

test('a drill triggered by two patterns names both', () => {
	const sitSquats = mobility(['squat', 'lunge']).find((d) => d.exercise_id === 'Sit_Squats');
	assert.ok(sitSquats);
	assert.match(sitSquats.why, /squatting/);
	assert.match(sitSquats.why, /lunging/);
});

test('no duplicate exercise ids', () => {
	const ids = mobility(FULL_BODY)
		.map((d) => d.exercise_id)
		.filter((id) => id !== null);
	assert.equal(new Set(ids).size, ids.length);
});

test('null and undefined patterns are ignored, not crashed on', () => {
	const list = mobility([null, undefined, 'squat']);
	assert.ok(list.some((d) => d.exercise_id === 'Sit_Squats'));
});

test('deterministic: the same patterns produce the same list', () => {
	assert.deepEqual(mobility(FULL_BODY), mobility(FULL_BODY));
});

test('every mapped drill exists in the exercise catalog', () => {
	const catalog = JSON.parse(
		readFileSync(new URL('../../../data/exercises.json', import.meta.url), 'utf8')
	) as { id: string }[];
	const ids = new Set(catalog.map((e) => e.id));
	const missing = MOBILITY_EXERCISE_IDS.filter((id) => !ids.has(id));
	assert.deepEqual(missing, [], `mapped ids not in the catalog: ${missing.join(', ')}`);
});

test('the compound patterns each contribute drills of their own', () => {
	// A pattern with no drills is not an error, but for the big compounds it
	// would be an oversight rather than a choice.
	for (const p of ['squat', 'hip_hinge', 'horizontal_press', 'vertical_pull'] as MovementPattern[]) {
		assert.ok(mobility([p]).length > 3, `${p} contributed no drills of its own`);
	}
});
