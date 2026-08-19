import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, defaultSplitStyle } from './generate.ts';
import { MAJOR_GROUPS, muscleGroup, weeklySetsByGroup, actualSetsByGroup, stalenessByGroup, nextPosition, groupsForSession } from './volume.ts';
import { PROFILES } from './profiles.ts';
import type { Exercise, MovementPattern } from './types.ts';

let n = 0;
function ex(
	pattern: MovementPattern | null,
	equipment: string,
	muscles: string[],
	priority = 50,
	secondary: string[] = []
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
		secondary_muscles: secondary,
		unilateral: false,
		priority
	};
}

// A small but complete catalog, mirroring how the real dataset tags things:
// compounds carry secondary muscles, and only hip_thrust is glute-primary.
// Plus unpatterned traps that must never surface.
function catalog(): Exercise[] {
	return [
		ex('squat', 'barbell', ['quadriceps'], 100, ['glutes', 'hamstrings']),
		ex('squat', 'machine', ['quadriceps'], 80, ['glutes']),
		ex('hip_hinge', 'barbell', ['hamstrings'], 100, ['glutes', 'lower back']),
		ex('hip_hinge', 'machine', ['hamstrings'], 60, ['glutes']),
		ex('horizontal_press', 'barbell', ['chest'], 100, ['triceps', 'shoulders']),
		ex('horizontal_press', 'machine', ['chest'], 70, ['triceps']),
		ex('incline_press', 'dumbbell', ['chest'], 90, ['shoulders', 'triceps']),
		ex('vertical_press', 'barbell', ['shoulders'], 90, ['triceps']),
		ex('vertical_press', 'machine', ['shoulders'], 60, ['triceps']),
		ex('horizontal_pull', 'barbell', ['middle back'], 95, ['biceps']),
		ex('horizontal_pull', 'cable', ['middle back'], 85, ['biceps']),
		ex('vertical_pull', 'cable', ['lats'], 90, ['biceps']),
		ex('vertical_pull', 'body only', ['lats'], 95, ['biceps']),
		ex('lunge', 'dumbbell', ['quadriceps'], 80, ['glutes', 'hamstrings']),
		ex('hip_thrust', 'barbell', ['glutes'], 90, ['hamstrings']),
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

const directGroups = (draft: { sessions: { exercises: { exercise: Exercise }[] }[] }) => {
	const found = new Set<string>();
	for (const s of draft.sessions) {
		for (const { exercise } of s.exercises) {
			for (const m of exercise.primary_muscles) {
				const g = muscleGroup(m);
				if (g) found.add(g);
			}
		}
	}
	return found;
};

test('every major muscle group gets direct work from 3 days up, in both styles', () => {
	for (const days of [3, 4, 5, 6] as const) {
		for (const splitStyle of ['full_body', 'targeted'] as const) {
			const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, catalog: catalog() });
			const covered = directGroups(draft);
			for (const group of MAJOR_GROUPS) {
				assert.ok(covered.has(group), `${group} has no direct work in a ${days}-day ${splitStyle} split`);
			}
		}
	}
});

test('a 2-day split cannot cover everything, and says which group it dropped', () => {
	// Twelve exercise slots will not give ten muscle groups direct work plus
	// a compound base. What matters is that the gap is reported, not hidden.
	for (const splitStyle of ['full_body', 'targeted'] as const) {
		const draft = generate({ daysPerWeek: 2, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, catalog: catalog() });
		const covered = directGroups(draft);
		for (const group of MAJOR_GROUPS) {
			if (covered.has(group)) continue;
			assert.ok(
				draft.warnings.some((w) => w.includes(group)),
				`${group} is uncovered in a 2-day ${splitStyle} split with no warning`
			);
		}
	}
});

test('glutes are no longer the neglected outlier among leg muscles', () => {
	// The regression this guards: glutes used to land at 4.5 weekly sets
	// against 10.5 for quads, because only hip_thrust is glute-primary and
	// no template reached it.
	for (const days of [2, 3, 4, 5, 6] as const) {
		for (const splitStyle of ['full_body', 'targeted'] as const) {
			const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, catalog: catalog() });
			const vol = weeklySetsByGroup(draft);
			const glutes = vol.glutes ?? 0;
			const quads = vol.quads ?? 0;
			assert.ok(
				glutes >= quads * 0.7,
				`${days}-day ${splitStyle}: glutes ${glutes} vs quads ${quads}`
			);
		}
	}
});

test('glutes clear the profile minimum wherever the split structure allows', () => {
	// A 3-day targeted split has exactly one leg day, so no leg muscle can
	// reach the minimum there — that is the cost the split warning names.
	const min = PROFILES.hypertrophy.weekly_sets_min;
	const reachable: [number, 'full_body' | 'targeted'][] = [
		[3, 'full_body'], [4, 'full_body'], [5, 'full_body'], [6, 'full_body'],
		[4, 'targeted'], [5, 'targeted'], [6, 'targeted']
	];
	for (const [days, splitStyle] of reachable) {
		const draft = generate({ daysPerWeek: days as 3 | 4 | 5 | 6, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, catalog: catalog() });
		const glutes = weeklySetsByGroup(draft).glutes ?? 0;
		assert.ok(glutes >= min, `${days}-day ${splitStyle} gives glutes only ${glutes} sets`);
	}
});

test('glutes always get direct work, even in a 2-day split', () => {
	for (const days of [2, 3, 4, 5, 6] as const) {
		for (const splitStyle of ['full_body', 'targeted'] as const) {
			const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, catalog: catalog() });
			assert.ok(directGroups(draft).has('glutes'), `${days}-day ${splitStyle} has no glute-primary exercise`);
		}
	}
});

test('a group with no direct work produces a warning instead of failing silently', () => {
	// A catalog with no glute-primary exercise at all.
	const noGlutes = catalog().filter((e) => !e.primary_muscles.includes('glutes'));
	const draft = generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'full_body', catalog: noGlutes });
	assert.ok(
		draft.warnings.some((w) => w.includes('glutes')),
		`expected a glutes warning, got: ${JSON.stringify(draft.warnings)}`
	);
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

test('split style defaults to full body below 4 days, targeted at 4+', () => {
	assert.equal(defaultSplitStyle(2), 'full_body');
	assert.equal(defaultSplitStyle(3), 'full_body');
	assert.equal(defaultSplitStyle(4), 'targeted');
	assert.equal(defaultSplitStyle(6), 'targeted');
});

test('both styles produce exactly one session per training day', () => {
	for (const days of [2, 3, 4, 5, 6] as const) {
		for (const splitStyle of ['full_body', 'targeted'] as const) {
			const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, catalog: catalog() });
			assert.equal(draft.sessions.length, days, `${splitStyle} at ${days} days gave ${draft.sessions.length} sessions`);
		}
	}
});

test('full body trains every major region in every session', () => {
	const draft = generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'full_body', catalog: catalog() });
	for (const s of draft.sessions) {
		const groups = new Set(groupsForSession(s));
		for (const region of ['chest', 'back']) {
			assert.ok(groups.has(region), `"${s.name}" has no ${region} work`);
		}
		const legs = ['quads', 'hamstrings', 'glutes'].some((g) => groups.has(g));
		assert.ok(legs, `"${s.name}" has no leg work`);
		assert.ok(groups.has('shoulders'), `"${s.name}" has no shoulder work`);
	}
});

test('full body rotates patterns so sessions are not duplicates', () => {
	const draft = generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'full_body', catalog: catalog() });
	const signatures = draft.sessions.map((s) => s.exercises.map((e) => e.exercise.movement_pattern).join(','));
	assert.equal(new Set(signatures).size, signatures.length, 'two full body sessions are identical');
});

test('targeted splits each session by region, not everything at once', () => {
	const draft = generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'targeted', catalog: catalog() });
	assert.deepEqual(draft.sessions.map((s) => s.name), ['Push', 'Pull', 'Legs']);
	// Leg day does no chest work, and push day does no leg work.
	const legs = new Set(groupsForSession(draft.sessions[2]));
	assert.ok(!legs.has('chest'));
	const push = new Set(groupsForSession(draft.sessions[0]));
	assert.ok(!push.has('quads') && !push.has('hamstrings'));
});

test('a low-frequency targeted split warns about the missed-day cost', () => {
	const targeted = generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'targeted', catalog: catalog() });
	assert.ok(targeted.warnings.some((w) => w.includes('once a week')));

	const fullBody = generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'full_body', catalog: catalog() });
	assert.ok(!fullBody.warnings.some((w) => w.includes('once a week')));

	const fiveDay = generate({ daysPerWeek: 5, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'targeted', catalog: catalog() });
	assert.ok(!fiveDay.warnings.some((w) => w.includes('once a week')));
});

test('the NULL-pattern guard holds for every style and emphasis', () => {
	for (const days of [2, 3, 4, 5, 6] as const) {
		for (const splitStyle of ['full_body', 'targeted'] as const) {
			for (const emphasis of ['balanced', 'lower', 'upper'] as const) {
				const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, emphasis, catalog: catalog() });
				assert.equal(draft.sessions.length, days);
				for (const s of draft.sessions) {
					for (const { exercise } of s.exercises) {
						assert.notEqual(exercise.movement_pattern, null, `${exercise.name} leaked into ${splitStyle}/${emphasis} "${s.name}"`);
					}
				}
			}
		}
	}
});

function regionVolume(draft: Parameters<typeof weeklySetsByGroup>[0]) {
	const vol = weeklySetsByGroup(draft);
	const sum = (groups: string[]) => groups.reduce((s, g) => s + (vol[g] ?? 0), 0);
	return {
		lower: sum(['quads', 'hamstrings', 'glutes', 'calves']),
		upper: sum(['chest', 'back', 'shoulders', 'biceps', 'triceps'])
	};
}

test('lower emphasis shifts weekly volume toward the lower body', () => {
	for (const splitStyle of ['full_body', 'targeted'] as const) {
		const balanced = regionVolume(generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, emphasis: 'balanced', catalog: catalog() }));
		const lower = regionVolume(generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, emphasis: 'lower', catalog: catalog() }));
		assert.ok(lower.lower > balanced.lower, `${splitStyle}: lower volume ${lower.lower} not above balanced ${balanced.lower}`);
		assert.ok(lower.upper <= balanced.upper, `${splitStyle}: upper volume ${lower.upper} rose above balanced ${balanced.upper}`);
	}
});

test('upper emphasis shifts weekly volume toward the upper body', () => {
	for (const splitStyle of ['full_body', 'targeted'] as const) {
		const balanced = regionVolume(generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, emphasis: 'balanced', catalog: catalog() }));
		const upper = regionVolume(generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, emphasis: 'upper', catalog: catalog() }));
		assert.ok(upper.upper > balanced.upper, `${splitStyle}: upper volume ${upper.upper} not above balanced ${balanced.upper}`);
		assert.ok(upper.lower <= balanced.lower, `${splitStyle}: lower volume ${upper.lower} rose above balanced ${balanced.lower}`);
	}
});

test('emphasis changes the exercises, not just the set counts', () => {
	const names = (d: ReturnType<typeof generate>) =>
		new Set(d.sessions.flatMap((s) => s.exercises.map((e) => e.exercise.id)));
	const balanced = names(generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'full_body', emphasis: 'balanced', catalog: catalog() }));
	const lower = names(generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'full_body', emphasis: 'lower', catalog: catalog() }));
	const gained = [...lower].filter((id) => !balanced.has(id));
	assert.ok(gained.length > 0, 'lower emphasis picked no exercise the balanced split lacks');
});

test('de-emphasis is maintenance, not neglect: compounds survive and no region hits zero', () => {
	for (const emphasis of ['lower', 'upper'] as const) {
		const draft = generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'targeted', emphasis, catalog: catalog() });
		const { lower, upper } = regionVolume(draft);
		assert.ok(lower > 0 && upper > 0, `${emphasis} emphasis zeroed a region (lower ${lower}, upper ${upper})`);
		// The de-emphasized region keeps its compound slots.
		const deEmph = emphasis === 'lower' ? ['chest', 'lats', 'middle back', 'shoulders'] : ['quadriceps', 'hamstrings', 'glutes'];
		const compounds = draft.sessions
			.flatMap((s) => s.exercises)
			.filter((pe) => pe.exercise.primary_muscles.some((m) => deEmph.includes(m)));
		assert.ok(compounds.length > 0, `${emphasis} emphasis removed every de-emphasized exercise`);
	}
});

test('emphasis never duplicates a pattern within a session', () => {
	for (const splitStyle of ['full_body', 'targeted'] as const) {
		for (const emphasis of ['lower', 'upper'] as const) {
			const draft = generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, emphasis, catalog: catalog() });
			for (const s of draft.sessions) {
				const patterns = s.exercises.map((e) => e.exercise.movement_pattern);
				assert.equal(new Set(patterns).size, patterns.length, `duplicate pattern in ${splitStyle}/${emphasis} "${s.name}": ${patterns.join(', ')}`);
			}
		}
	}
});

test('full body with upper emphasis still trains legs every session', () => {
	const draft = generate({ daysPerWeek: 3, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle: 'full_body', emphasis: 'upper', catalog: catalog() });
	for (const s of draft.sessions) {
		const groups = new Set(groupsForSession(s));
		const legs = ['quads', 'hamstrings', 'glutes'].some((g) => groups.has(g));
		assert.ok(legs, `"${s.name}" lost its leg work to upper emphasis`);
	}
});

test('rotation is cyclic and starts at the top', () => {
	assert.equal(nextPosition(4, null), 0);
	assert.equal(nextPosition(4, 0), 1);
	assert.equal(nextPosition(4, 3), 0);
});

test('the plan and the log score an exercise identically', () => {
	// weeklySetsByGroup and actualSetsByGroup must never drift: the stats page
	// shows them side by side and calls the difference under-training.
	const draft = generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', catalog: catalog() });
	const planned = weeklySetsByGroup(draft);
	const logged = actualSetsByGroup(
		draft.sessions.flatMap((s) =>
			s.exercises.map((pe) => ({
				primary_muscles: pe.exercise.primary_muscles,
				secondary_muscles: pe.exercise.secondary_muscles,
				movement_pattern: pe.exercise.movement_pattern,
				sets: pe.target_sets
			}))
		)
	);
	assert.deepEqual(planned, logged);
});
