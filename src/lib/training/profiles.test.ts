import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, prescriptionFor } from './profiles.ts';

const ALL = Object.values(PROFILES);

test('compound mechanic takes the profile compound block', () => {
	for (const p of ALL) {
		assert.deepEqual(prescriptionFor(p, 'compound'), {
			target_sets: p.compound.sets,
			rep_min: p.compound.rep_min,
			rep_max: p.compound.rep_max,
			rir_target: p.rir
		});
	}
});

test('isolation mechanic takes the profile isolation block', () => {
	for (const p of ALL) {
		assert.deepEqual(prescriptionFor(p, 'isolation'), {
			target_sets: p.isolation.sets,
			rep_min: p.isolation.rep_min,
			rep_max: p.isolation.rep_max,
			rir_target: p.rir
		});
	}
});

test('the two blocks differ, so the distinction is worth making', () => {
	for (const p of ALL) {
		assert.notDeepEqual(prescriptionFor(p, 'compound'), prescriptionFor(p, 'isolation'));
	}
});

// An exercise the dataset declined to classify is likelier a curl than a squat,
// and the failure mode is a lighter prescription rather than a heavier one.
test('unclassified mechanic falls to isolation', () => {
	for (const p of ALL) {
		const iso = prescriptionFor(p, 'isolation');
		assert.deepEqual(prescriptionFor(p, null), iso);
		assert.deepEqual(prescriptionFor(p, undefined), iso);
		assert.deepEqual(prescriptionFor(p, 'olympic weightlifting'), iso);
	}
});

test('every shipped profile prescribes something loggable', () => {
	for (const p of ALL) {
		for (const mechanic of ['compound', 'isolation']) {
			const rx = prescriptionFor(p, mechanic);
			assert.ok(rx.target_sets >= 1, `${p.key} ${mechanic} sets`);
			assert.ok(rx.rep_min >= 1, `${p.key} ${mechanic} rep_min`);
			assert.ok(rx.rep_min <= rx.rep_max, `${p.key} ${mechanic} rep range`);
			assert.ok(rx.rir_target >= 0, `${p.key} ${mechanic} rir`);
		}
	}
});
