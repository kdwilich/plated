import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	actualSetsByGroup,
	isUnderTarget,
	volumeWarnings,
	volumeSummary,
	MAJOR_GROUPS,
	DISPLAY_GROUPS,
	type TrainedExercise
} from './volume.ts';
import { PROFILES } from './profiles.ts';
import type { RoutineDraft } from './types.ts';

const trained = (o: Partial<TrainedExercise>): TrainedExercise => ({
	primary_muscles: [],
	secondary_muscles: [],
	movement_pattern: 'horizontal_press',
	sets: 3,
	...o
});

test('primary muscles count full', () => {
	const vol = actualSetsByGroup([trained({ primary_muscles: ['chest'], sets: 4 })]);
	assert.equal(vol.chest, 4);
});

test('secondary muscles count half', () => {
	// A bench press is real triceps work and pretending otherwise misleads the
	// table — the same rule weeklySetsByGroup applies to the plan.
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['chest'], secondary_muscles: ['triceps'], sets: 4 })
	]);
	assert.equal(vol.chest, 4);
	assert.equal(vol.triceps, 2);
});

test('muscles collapse into the groups a lifter thinks in', () => {
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['lats'], sets: 3 }),
		trained({ primary_muscles: ['middle back'], sets: 3 })
	]);
	assert.equal(vol.back, 6);
});

test('exercises with no movement pattern score nothing', () => {
	// Cardio and unpatterned oddities are excluded from volume, exactly as they
	// are from the plan. They still appear in the drill-down under Other.
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['quadriceps'], movement_pattern: null, sets: 5 })
	]);
	assert.deepEqual(vol, {});
});

test('half sets round to the nearest half rather than drifting', () => {
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['chest'], secondary_muscles: ['triceps'], sets: 3 })
	]);
	assert.equal(vol.triceps, 1.5);
});

test('an unmapped muscle is skipped rather than becoming its own group', () => {
	const vol = actualSetsByGroup([trained({ primary_muscles: ['spleen'], sets: 3 })]);
	assert.deepEqual(vol, {});
});

test('nothing trained is an empty table', () => {
	assert.deepEqual(actualSetsByGroup([]), {});
});

test('one exercise credits a group once, however many of its muscles land there', () => {
	// Barbell Deadlift's real tagging: lower back primary, with lats, middle
	// back and traps secondary. `lats` and `middle back` both collapse to
	// `back`, and the old scoring paid for each one — three sets of deadlifts
	// booked 7.5 sets of "back", which is why back always read as covered.
	const vol = actualSetsByGroup([
		trained({
			primary_muscles: ['lower back'],
			secondary_muscles: ['lats', 'middle back', 'traps', 'hamstrings'],
			movement_pattern: 'hip_hinge',
			sets: 3
		})
	]);
	assert.equal(vol.back, 1.5);
	assert.equal(vol['lower back'], 3);
	assert.equal(vol.hamstrings, 1.5);
});

test('a primary hit is not topped up by a secondary in the same group', () => {
	// Every curl in the catalog is biceps-primary with forearms secondary, and
	// forearms map to biceps. Full credit already covers it.
	const vol = actualSetsByGroup([
		trained({
			primary_muscles: ['biceps'],
			secondary_muscles: ['forearms'],
			movement_pattern: 'biceps_curl',
			sets: 4
		})
	]);
	assert.equal(vol.biceps, 4);
});

test('two secondaries in one group still pay only once', () => {
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['chest'], secondary_muscles: ['lats', 'traps'], sets: 4 })
	]);
	assert.equal(vol.back, 2);
});

test('traps and lower back are their own groups, not pulling volume', () => {
	// A shrug is not a row and a deadlift is not a pulldown. Folding all four
	// dataset muscles into `back` let a routine with one set of lat work
	// report a covered back.
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['traps'], movement_pattern: 'shrug', sets: 3 }),
		trained({ primary_muscles: ['lower back'], movement_pattern: 'hip_hinge', sets: 3 }),
		trained({ primary_muscles: ['lats'], movement_pattern: 'vertical_pull', sets: 3 })
	]);
	assert.equal(vol.back, 3);
	assert.equal(vol.traps, 3);
	assert.equal(vol['lower back'], 3);
});

test('the coverage contract does not demand a slot for traps or lower back', () => {
	// Both get plenty from rows, hinges and carries. Naming them in
	// MAJOR_GROUPS would make the generator warn about a gap that is not one.
	assert.ok(!(MAJOR_GROUPS as readonly string[]).includes('traps'));
	assert.ok(!(MAJOR_GROUPS as readonly string[]).includes('lower back'));
	assert.ok((DISPLAY_GROUPS as readonly string[]).includes('traps'));
	assert.ok((DISPLAY_GROUPS as readonly string[]).includes('lower back'));
});

test('only groups with a target can fall short of it', () => {
	// The volume table painted three sets of shrugs yellow, as if traps were
	// deficient — while the generator neither chased traps nor warned about
	// them. One of the two had to be wrong, and it was the table.
	assert.equal(isUnderTarget('back', 9, 10), true);
	assert.equal(isUnderTarget('back', 10, 10), false);
	assert.equal(isUnderTarget('traps', 3, 10), false);
	assert.equal(isUnderTarget('lower back', 3.5, 10), false);
	// No profile, nothing to be short of.
	assert.equal(isUnderTarget('back', 1, undefined), false);
});

// A minimal draft: one exercise per group we care about, at a set count we choose.
const draftOf = (
	entries: [primary: string, sets: number][],
	secondary: string[] = []
): RoutineDraft => ({
	profile_key: 'hypertrophy',
	warnings: [],
	sessions: [
		{
			name: 'A',
			exercises: entries.map(([m, sets], i) => ({
				exercise: {
					id: `x${i}`,
					name: `Exercise ${i}`,
					measurement: 'load_reps',
					movement_pattern: 'horizontal_press',
					progression: 'double',
					equipment: 'barbell',
					primary_muscles: [m],
					secondary_muscles: secondary,
					unilateral: false,
					priority: 50
				},
				target_sets: sets,
				rep_min: 6,
				rep_max: 10,
				rir_target: 2
			}))
		}
	]
});

test('a group with no direct work at all is named', () => {
	const w = volumeWarnings(draftOf([['chest', 12]]), PROFILES.hypertrophy);
	assert.ok(w.some((x) => x.message.includes('Nothing in this routine trains quads')));
});

test('a group with only indirect work says so, with the number', () => {
	const w = volumeWarnings(draftOf([['chest', 12]], ['triceps']), PROFILES.hypertrophy);
	assert.ok(w.some((x) => x.group === 'triceps' && x.kind === 'indirect'));
});

test('a group with direct work but under the minimum is named', () => {
	const w = volumeWarnings(draftOf([['chest', 4]]), PROFILES.hypertrophy);
	assert.ok(
		w.some((x) => x.group === 'chest' && x.kind === 'under' && x.sets === 4),
		`expected a chest shortfall, got ${JSON.stringify(w)}`
	);
});

test('a group over the top of the range is named too', () => {
	const w = volumeWarnings(draftOf([['chest', 25]]), PROFILES.hypertrophy);
	assert.ok(
		w.some((x) => x.group === 'chest' && x.kind === 'over' && x.sets === 25),
		`expected a chest overshoot, got ${JSON.stringify(w)}`
	);
});

test('a group inside the range is not mentioned', () => {
	const w = volumeWarnings(draftOf([['chest', 12]]), PROFILES.hypertrophy);
	assert.ok(!w.some((x) => x.group === 'chest'));
});

test('traps and lower back are never reported as short', () => {
	// They have no target, so they cannot fall below one.
	const w = volumeWarnings(draftOf([['traps', 3]]), PROFILES.hypertrophy);
	assert.ok(!w.some((x) => x.group === 'traps'));
	assert.ok(!w.some((x) => x.group === 'lower back'));
});

test('the summary counts the groups instead of repeating the sentence', () => {
	// Eight near-identical warnings are honest and unreadable. The count is the
	// part worth seeing first: it is a fact about the split, not about eight
	// separate exercises you forgot.
	const p = PROFILES.hypertrophy;
	const short = volumeWarnings(draftOf([['chest', 4], ['back', 4]]), p);
	assert.equal(volumeSummary(short, p), '10 muscle groups short of 10 sets a week.');

	const one = volumeSummary([{ group: 'chest', kind: 'under', sets: 4, message: '' }], p);
	assert.equal(one, '1 muscle group short of 10 sets a week.');

	const over = volumeSummary([{ group: 'chest', kind: 'over', sets: 25, message: '' }], p);
	assert.equal(over, '1 muscle group past 20 sets a week.');

	const both = volumeSummary(
		[
			{ group: 'chest', kind: 'over', sets: 25, message: '' },
			{ group: 'back', kind: 'under', sets: 4, message: '' },
			{ group: 'abs', kind: 'none', sets: 0, message: '' }
		],
		p
	);
	assert.equal(both, '2 muscle groups short of 10 sets a week, 1 past 20.');
});

test('a routine inside the range has nothing to summarise', () => {
	assert.equal(volumeSummary([], PROFILES.hypertrophy), null);
});
