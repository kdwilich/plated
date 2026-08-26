import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasLoggedWork, workSummary, type ActiveSession, type ActiveSet } from './session.ts';

const set = (over: Partial<ActiveSet> = {}): ActiveSet => ({
	id: 's1',
	exercise_id: 'ex1',
	position: 0,
	weight_lb: 135,
	reps: 8,
	duration_s: null,
	distance_m: null,
	rir: null,
	is_warmup: false,
	completed_at: '2026-08-25T17:00:00.000Z',
	...over
});

const session = (over: Partial<ActiveSession> = {}): ActiveSession => ({
	id: 'w1',
	user_id: 1,
	routine_session_id: 'rs1',
	session_name: 'Push',
	started_at: '2026-08-25T16:55:00.000Z',
	finished_at: null,
	notes: null,
	exercises: [],
	sets: [],
	gym: { plates: [], dumbbell_step_lb: 5, machine_step_lb: 10 },
	...over
});

test('a session that was started and never touched holds nothing', () => {
	assert.equal(hasLoggedWork(session()), false);
	assert.equal(hasLoggedWork(undefined), false);
});

test('a warm-up set counts as work — it was typed in like any other', () => {
	assert.equal(hasLoggedWork(session({ sets: [set({ is_warmup: true })] })), true);
});

test('a ticked mobility drill counts, and so does a note', () => {
	assert.equal(hasLoggedWork(session({ mobility_done: ['shoulder_cars'] })), true);
	assert.equal(hasLoggedWork(session({ notes: 'left elbow cranky' })), true);
	assert.equal(hasLoggedWork(session({ notes: '   ' })), false);
});

test('a finished session is not work in progress', () => {
	const done = session({ sets: [set()], finished_at: '2026-08-25T18:00:00.000Z' });
	assert.equal(hasLoggedWork(done), false);
});

test('the summary names what is at stake, singular and plural', () => {
	assert.equal(workSummary(session({ sets: [set()] })), '1 set');
	assert.equal(workSummary(session({ sets: [set(), set({ id: 's2' })] })), '2 sets');
	assert.equal(workSummary(session({ mobility_done: ['a'] })), '1 warm-up drill');
});

test('the summary lists everything the session holds', () => {
	const s = session({ sets: [set(), set({ id: 's2' })], mobility_done: ['a', 'b'], notes: 'tweaky knee' });
	assert.equal(workSummary(s), '2 sets, 2 warm-up drills, a note');
});

test('an untouched session summarises to nothing at all', () => {
	assert.equal(workSummary(session()), '');
});
