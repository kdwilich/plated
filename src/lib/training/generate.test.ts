import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from './generate.ts';
import { muscleGroup, weeklySetsByGroup, stalenessByGroup, nextPosition, groupsForSession } from './volume.ts';
import { PROFILES } from './profiles.ts';
import type { Exercise, MovementPattern } from './types.ts';

let n = 0;
function ex(
	pattern: MovementPattern | null,
	equipment: string,
	muscles: string[],
	priority = 50
): Exercise {
	n++;
	return {
		id: `e${n}`,
		name: `Exercise ${n} (${pattern ?? 'unpatterned'})`,
		measurement: 'load_reps',
		movement_pattern: pattern,
		progression: 'double',
		equipment,
		primary_muscles: muscles,
		secondary_muscles: [],
		unilateral: false,
		priority
	};
}

// A small but complete catalog: one exercise per pattern in barbell/machine
// flavors, plus unpatterned traps that must never surface.
function catalog(): Exercise[] {
	return [
		ex('squat', 'barbell', ['quadriceps'], 100),
		ex('squat', 'machine', ['quadriceps'], 80),
		ex('hip_hinge', 'barbell', ['hamstrings'], 100),
		ex('hip_hinge', 'machine', ['hamstrings'], 60),
		ex('horizontal_press', 'barbell', ['chest'], 100),
		ex('horizontal_press', 'machine', ['chest'], 70),
		ex('incline_press', 'dumbbell', ['chest'], 90),
		ex('vertical_press', 'barbell', ['shoulders'], 90),
		ex('vertical_press', 'machine', ['shoulders'], 60),
		ex('horizontal_pull', 'barbell', ['middle back'], 95),
		ex('horizontal_pull', 'cable', ['middle back'], 85),
		ex('vertical_pull', 'cable', ['lats'], 90),
		ex('vertical_pull', 'body only', ['lats'], 95),
		ex('lunge', 'dumbbell', ['quadriceps'], 80),
		ex('hip_thrust', 'barbell', ['glutes'], 90),
		ex('chest_fly', 'dumbbell', ['chest'], 80),
		ex('lateral_raise', 'dumbbell', ['shoulders'], 90),
		ex('rear_delt', 'cable', ['shoulders'], 85),
		ex('biceps_curl', 'dumbbell', ['biceps'], 85),
		ex('triceps_extension', 'cable', ['triceps'], 85),
		ex('leg_curl', 'machine', ['hamstrings'], 85),
		ex('leg_extension', 'machine', ['quadriceps'], 85),
		ex('calf_raise', 'machine', ['calves'], 85),
		ex('ab_flexion', 'cable', ['abdominals'], 80),
		ex('shrug', 'barbell', ['traps'], 80),
		ex('pullover', 'dumbbell', ['lats'], 70),
		// The traps: a mile run and an unmapped machine. Loggable, never generated.
		ex(null, 'body only', ['quadriceps'], 999),
		ex(null, 'machine', ['chest'], 999)
	];
}

const ALL_EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'body only'];

test('generator never emits an exercise without a movement pattern', () => {
	for (const days of [2, 3, 4, 5, 6] as const) {
		const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', catalog: catalog() });
		for (const s of draft.sessions) {
			for (const { exercise } of s.exercises) {
				assert.notEqual(exercise.movement_pattern, null, `${exercise.name} leaked into "${s.name}"`);
			}
		}
	}
});

test('equipment filter is respected', () => {
	const draft = generate({ daysPerWeek: 3, equipment: ['machine', 'cable', 'dumbbell', 'body only'], profileKey: 'hypertrophy', catalog: catalog() });
	for (const s of draft.sessions) {
		for (const { exercise } of s.exercises) {
			assert.notEqual(exercise.equipment, 'barbell', `${exercise.name} needs a barbell the gym lacks`);
		}
	}
	// The machine squat wins the squat slot once barbells are gone
	const squats = draft.sessions.flatMap((s) => s.exercises).filter((e) => e.exercise.movement_pattern === 'squat');
	assert.ok(squats.length >= 1);
	assert.equal(squats[0].exercise.equipment, 'machine');
});

test('higher priority wins a slot', () => {
	const draft = generate({ daysPerWeek: 2, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', catalog: catalog() });
	const press = draft.sessions[0].exercises.find((e) => e.exercise.movement_pattern === 'horizontal_press');
	assert.equal(press?.exercise.priority, 100);
});

test('missing pattern for a required slot produces a warning, not a crash', () => {
	const noPull = catalog().filter((e) => e.movement_pattern !== 'vertical_pull');
	const draft = generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', catalog: noPull });
	assert.ok(draft.warnings.some((w) => w.includes('vertical pull')));
});

test('profile prescriptions land on the draft', () => {
	const draft = generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'strength', catalog: catalog() });
	const compound = draft.sessions[0].exercises[0];
	assert.equal(compound.rep_min, PROFILES.strength.compound.rep_min);
	assert.equal(compound.rep_max, PROFILES.strength.compound.rep_max);
	assert.ok(compound.target_sets >= PROFILES.strength.compound.sets);
});

test('volume pass: a below-minimum group means all its direct exercises hit the cap', () => {
	const profile = PROFILES.hypertrophy;
	const cap = Math.max(profile.compound.sets, profile.isolation.sets) + 2;
	const draft = generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', catalog: catalog() });
	const vol = weeklySetsByGroup(draft);
	const all = draft.sessions.flatMap((s) => s.exercises);
	for (const [group, sets] of Object.entries(vol)) {
		if (sets >= profile.weekly_sets_min) continue;
		const direct = all.filter((pe) =>
			pe.exercise.primary_muscles.some((m) => muscleGroup(m) === group)
		);
		for (const pe of direct) {
			assert.equal(pe.target_sets, cap, `${group} is short (${sets}) but ${pe.exercise.name} sits at ${pe.target_sets}/${cap} sets`);
		}
	}
});

test('weekly volume for major groups lands within sane bounds for every day count', () => {
	for (const days of [2, 3, 4, 5, 6] as const) {
		const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', catalog: catalog() });
		const vol = weeklySetsByGroup(draft);
		for (const g of ['chest', 'back', 'quads']) {
			assert.ok((vol[g] ?? 0) >= 3, `${g} got ${vol[g]} sets on ${days} days`);
			assert.ok((vol[g] ?? 0) <= 30, `${g} got ${vol[g]} sets on ${days} days`);
		}
	}
});

test('unpatterned exercises never count toward volume', () => {
	const run = catalog().find((e) => e.movement_pattern === null)!;
	const draft = {
		profile_key: 'hypertrophy',
		warnings: [],
		sessions: [{ name: 'X', exercises: [{ exercise: run, target_sets: 5, rep_min: 1, rep_max: 1, rir_target: 0 }] }]
	};
	assert.deepEqual(weeklySetsByGroup(draft), {});
	assert.deepEqual(groupsForSession(draft.sessions[0]), []);
});

test('staleness counts whole days since the last time a group was trained', () => {
	const now = new Date('2026-08-16T12:00:00Z');
	const s = stalenessByGroup(
		[
			{ group: 'quads', completed_at: '2026-08-07T18:00:00Z' },
			{ group: 'chest', completed_at: '2026-08-15T18:00:00Z' },
			{ group: 'quads', completed_at: '2026-08-01T18:00:00Z' } // older, ignored
		],
		now
	);
	assert.equal(s.quads, 8);
	assert.equal(s.chest, 0);
	assert.equal(s.back, undefined);
});

test('rotation is cyclic and starts at the top', () => {
	assert.equal(nextPosition(4, null), 0);
	assert.equal(nextPosition(4, 0), 1);
	assert.equal(nextPosition(4, 3), 0);
});
