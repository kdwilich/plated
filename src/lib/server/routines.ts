import type { RoutineDraft } from '../training/types.ts';
import { PROFILES } from '../training/profiles.ts';
import type { ExerciseRow } from './catalog.ts';

export interface RoutineExerciseRow {
	id: string;
	position: number;
	exercise_id: string;
	target_sets: number;
	rep_min: number | null;
	rep_max: number | null;
	rir_target: number | null;
	bar_id: string | null;
	increment_lb: number | null;
	exercise: ExerciseRow;
}

export interface RoutineSessionRow {
	id: string;
	position: number;
	name: string;
	exercises: RoutineExerciseRow[];
}

export interface RoutineRow {
	id: string;
	name: string;
	profile_key: string;
	gym_id: string | null;
	is_active: boolean;
	sessions: RoutineSessionRow[];
}

function parseExercise(r: Record<string, unknown>): ExerciseRow {
	return {
		...(r as unknown as ExerciseRow),
		primary_muscles: JSON.parse((r.primary_muscles as string) || '[]'),
		secondary_muscles: JSON.parse((r.secondary_muscles as string) || '[]'),
		unilateral: !!r.unilateral
	};
}

/** A library row: enough to choose by, without hydrating every exercise. */
export interface RoutineSummary {
	id: string;
	name: string;
	profile_key: string;
	is_active: boolean;
	created_at: string;
	session_count: number;
	exercise_count: number;
}

export async function listRoutines(db: D1Database, userId: number): Promise<RoutineSummary[]> {
	const { results } = await db
		.prepare(
			`SELECT r.id, r.name, r.profile_key, r.is_active, r.created_at,
			        COUNT(DISTINCT rs.id) AS session_count,
			        COUNT(re.id) AS exercise_count
			 FROM routine r
			 LEFT JOIN routine_session rs ON rs.routine_id = r.id
			 LEFT JOIN routine_exercise re ON re.session_id = rs.id
			 WHERE r.user_id = ?
			 GROUP BY r.id
			 ORDER BY r.is_active DESC, r.created_at DESC`
		)
		.bind(userId)
		.all();
	return (results as Record<string, unknown>[]).map((r) => ({
		id: r.id as string,
		name: r.name as string,
		profile_key: r.profile_key as string,
		is_active: !!r.is_active,
		created_at: r.created_at as string,
		session_count: r.session_count as number,
		exercise_count: r.exercise_count as number
	}));
}

export async function getActiveRoutine(
	db: D1Database,
	userId: number
): Promise<RoutineRow | null> {
	const routine = await db
		.prepare(
			'SELECT * FROM routine WHERE is_active = 1 AND user_id = ? ORDER BY created_at DESC LIMIT 1'
		)
		.bind(userId)
		.first();
	if (!routine) return null;
	return hydrateRoutine(db, routine as Record<string, unknown>);
}

export async function getRoutine(
	db: D1Database,
	userId: number,
	id: string
): Promise<RoutineRow | null> {
	const routine = await db
		.prepare('SELECT * FROM routine WHERE id = ? AND user_id = ?')
		.bind(id, userId)
		.first();
	if (!routine) return null;
	return hydrateRoutine(db, routine as Record<string, unknown>);
}

async function hydrateRoutine(db: D1Database, routine: Record<string, unknown>): Promise<RoutineRow> {
	const id = routine.id as string;
	const [sessions, exercises] = await db.batch([
		db.prepare('SELECT * FROM routine_session WHERE routine_id = ? ORDER BY position').bind(id),
		db
			.prepare(
				`SELECT re.id re_id, re.session_id, re.position re_position, re.target_sets, re.rep_min, re.rep_max,
				        re.rir_target, re.bar_id, re.increment_lb, e.*
				 FROM routine_exercise re
				 JOIN routine_session rs ON rs.id = re.session_id
				 JOIN exercise e ON e.id = re.exercise_id
				 WHERE rs.routine_id = ? ORDER BY re.position`
			)
			.bind(id)
	]);
	const bySession = new Map<string, RoutineExerciseRow[]>();
	for (const raw of exercises.results as Record<string, unknown>[]) {
		const list = bySession.get(raw.session_id as string) ?? [];
		list.push({
			id: raw.re_id as string,
			position: raw.re_position as number,
			exercise_id: raw.id as string,
			target_sets: raw.target_sets as number,
			rep_min: raw.rep_min as number | null,
			rep_max: raw.rep_max as number | null,
			rir_target: raw.rir_target as number | null,
			bar_id: raw.bar_id as string | null,
			increment_lb: raw.increment_lb as number | null,
			exercise: parseExercise(raw)
		});
		bySession.set(raw.session_id as string, list);
	}
	return {
		id,
		name: routine.name as string,
		profile_key: routine.profile_key as string,
		gym_id: routine.gym_id as string | null,
		is_active: !!routine.is_active,
		sessions: (sessions.results as Record<string, unknown>[]).map((s) => ({
			id: s.id as string,
			position: s.position as number,
			name: s.name as string,
			exercises: bySession.get(s.id as string) ?? []
		}))
	};
}

/**
 * Ownership travels through the foreign keys rather than through a column on
 * every table. These are the two predicates that walk it, and every child
 * mutation below uses one — reaching a child row by its id alone is how one
 * account would edit another's routine.
 */
const OWNED_SESSION = 'routine_id IN (SELECT id FROM routine WHERE user_id = ?)';
const OWNED_EXERCISE =
	'session_id IN (SELECT rs.id FROM routine_session rs JOIN routine r ON r.id = rs.routine_id WHERE r.user_id = ?)';

/** Persist a generated (or hand-built) draft as the new active routine. */
export async function saveRoutineFromDraft(
	db: D1Database,
	userId: number,
	draft: RoutineDraft,
	name: string,
	gymId: string | null,
	activate = true
): Promise<string> {
	const routineId = crypto.randomUUID();
	const stmts: D1PreparedStatement[] = [];
	if (activate) {
		stmts.push(
			db.prepare('UPDATE routine SET is_active = 0 WHERE is_active = 1 AND user_id = ?').bind(userId)
		);
	}
	stmts.push(
		db
			.prepare('INSERT INTO routine (id, name, profile_key, gym_id, is_active, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(routineId, name, draft.profile_key, gymId, activate ? 1 : 0, new Date().toISOString(), userId)
	);
	draft.sessions.forEach((session, si) => {
		const sessionId = crypto.randomUUID();
		stmts.push(
			db
				.prepare('INSERT INTO routine_session (id, routine_id, position, name) VALUES (?, ?, ?, ?)')
				.bind(sessionId, routineId, si, session.name)
		);
		session.exercises.forEach((ex, ei) => {
			stmts.push(
				db
					.prepare(
						'INSERT INTO routine_exercise (id, session_id, position, exercise_id, target_sets, rep_min, rep_max, rir_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
					)
					.bind(crypto.randomUUID(), sessionId, ei, ex.exercise.id, ex.target_sets, ex.rep_min, ex.rep_max, ex.rir_target)
			);
		});
	});
	await db.batch(stmts);
	return routineId;
}

/**
 * A hydrated routine back into the shape the training core speaks, so the
 * volume table and duplication both reuse code that already exists.
 * Nulls coalesce to the profile's own numbers rather than to zero — a row
 * predating a prescription must not read as free volume.
 */
export function routineToDraft(routine: RoutineRow): RoutineDraft {
	const profile = PROFILES[routine.profile_key] ?? PROFILES.hypertrophy;
	return {
		profile_key: routine.profile_key,
		warnings: [],
		sessions: routine.sessions.map((s) => ({
			name: s.name,
			exercises: s.exercises.map((re) => ({
				exercise: re.exercise,
				target_sets: re.target_sets,
				rep_min: re.rep_min ?? profile.isolation.rep_min,
				rep_max: re.rep_max ?? profile.isolation.rep_max,
				rir_target: re.rir_target ?? profile.rir
			}))
		}))
	};
}

/**
 * A blank routine, deliberately inactive: nothing you are still assembling
 * should be what the home page offers you to train.
 */
export async function createRoutine(
	db: D1Database,
	userId: number,
	name: string,
	profileKey: string,
	gymId: string | null
): Promise<string> {
	const id = crypto.randomUUID();
	await db
		.prepare(
			'INSERT INTO routine (id, name, profile_key, gym_id, is_active, created_at, user_id) VALUES (?, ?, ?, ?, 0, ?, ?)'
		)
		.bind(id, name, profileKey, gymId, new Date().toISOString(), userId)
		.run();
	return id;
}

export async function renameRoutine(
	db: D1Database,
	userId: number,
	id: string,
	name: string
): Promise<void> {
	await db
		.prepare('UPDATE routine SET name = ? WHERE id = ? AND user_id = ?')
		.bind(name, id, userId)
		.run();
}

export async function activateRoutine(
	db: D1Database,
	userId: number,
	id: string
): Promise<void> {
	await db.batch([
		// Scoped, or signing in and picking a routine deactivates everyone's.
		db.prepare('UPDATE routine SET is_active = 0 WHERE is_active = 1 AND user_id = ?').bind(userId),
		db.prepare('UPDATE routine SET is_active = 1 WHERE id = ? AND user_id = ?').bind(id, userId)
	]);
}

/**
 * Deleting the active routine promotes the newest survivor. Otherwise a delete
 * silently leaves the home page saying "No routine yet" while a library full of
 * routines sits one tap away. Deleting the last one correctly lands there.
 */
export async function deleteRoutine(db: D1Database, userId: number, id: string): Promise<void> {
	const row = await db
		.prepare('SELECT is_active FROM routine WHERE id = ? AND user_id = ?')
		.bind(id, userId)
		.first();
	if (!row) return;
	await db.prepare('DELETE FROM routine WHERE id = ? AND user_id = ?').bind(id, userId).run();
	if (!row.is_active) return;
	// The survivor has to be one of yours. Unscoped, this promoted whichever
	// routine in the table happened to be newest.
	const next = await db
		.prepare('SELECT id FROM routine WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
		.bind(userId)
		.first();
	if (next) await activateRoutine(db, userId, next.id as string);
}

/** An independent copy, inactive, so the original keeps training you. */
export async function duplicateRoutine(
	db: D1Database,
	userId: number,
	id: string
): Promise<string | null> {
	const routine = await getRoutine(db, userId, id);
	if (!routine) return null;
	return saveRoutineFromDraft(
		db,
		userId,
		routineToDraft(routine),
		`${routine.name} copy`,
		routine.gym_id,
		false
	);
}

export async function addRoutineSession(
	db: D1Database,
	userId: number,
	routineId: string,
	name: string
): Promise<void> {
	const owned = await db
		.prepare('SELECT id FROM routine WHERE id = ? AND user_id = ?')
		.bind(routineId, userId)
		.first();
	if (!owned) return;
	const { results } = await db
		.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM routine_session WHERE routine_id = ?')
		.bind(routineId)
		.all();
	const pos = (results[0]?.pos as number) ?? 0;
	await db
		.prepare('INSERT INTO routine_session (id, routine_id, position, name) VALUES (?, ?, ?, ?)')
		.bind(crypto.randomUUID(), routineId, pos, name)
		.run();
}

export async function renameRoutineSession(
	db: D1Database,
	userId: number,
	id: string,
	name: string
): Promise<void> {
	await db
		.prepare(`UPDATE routine_session SET name = ? WHERE id = ? AND ${OWNED_SESSION}`)
		.bind(name, id, userId)
		.run();
}

/** routine_exercise cascades on the FK, so the day's exercises go with it. */
export async function deleteRoutineSession(
	db: D1Database,
	userId: number,
	id: string
): Promise<void> {
	await db
		.prepare(`DELETE FROM routine_session WHERE id = ? AND ${OWNED_SESSION}`)
		.bind(id, userId)
		.run();
}

/** Swaps positions with the neighbour in `dir`. A no-op at either end. */
export async function moveRoutineSession(
	db: D1Database,
	userId: number,
	id: string,
	dir: 'up' | 'down'
): Promise<void> {
	const me = await db
		.prepare(`SELECT routine_id, position FROM routine_session WHERE id = ? AND ${OWNED_SESSION}`)
		.bind(id, userId)
		.first();
	if (!me) return;
	const neighbour = await db
		.prepare(
			dir === 'up'
				? 'SELECT id, position FROM routine_session WHERE routine_id = ? AND position < ? ORDER BY position DESC LIMIT 1'
				: 'SELECT id, position FROM routine_session WHERE routine_id = ? AND position > ? ORDER BY position ASC LIMIT 1'
		)
		.bind(me.routine_id as string, me.position as number)
		.all()
		.then((r) => r.results[0] as Record<string, unknown> | undefined);
	if (!neighbour) return;
	await db.batch([
		db
			.prepare('UPDATE routine_session SET position = ? WHERE id = ?')
			.bind(neighbour.position as number, id),
		db
			.prepare('UPDATE routine_session SET position = ? WHERE id = ?')
			.bind(me.position as number, neighbour.id as string)
	]);
}

export async function updateRoutineExercise(
	db: D1Database,
	userId: number,
	id: string,
	fields: { target_sets?: number; rep_min?: number; rep_max?: number; exercise_id?: string; increment_lb?: number | null }
): Promise<void> {
	const sets: string[] = [];
	const binds: unknown[] = [];
	for (const [k, v] of Object.entries(fields)) {
		sets.push(`${k} = ?`);
		binds.push(v);
	}
	if (!sets.length) return;
	binds.push(id, userId);
	await db
		.prepare(`UPDATE routine_exercise SET ${sets.join(', ')} WHERE id = ? AND ${OWNED_EXERCISE}`)
		.bind(...binds)
		.run();
}

export async function deleteRoutineExercise(
	db: D1Database,
	userId: number,
	id: string
): Promise<void> {
	await db
		.prepare(`DELETE FROM routine_exercise WHERE id = ? AND ${OWNED_EXERCISE}`)
		.bind(id, userId)
		.run();
}

export async function addRoutineExercise(
	db: D1Database,
	userId: number,
	sessionId: string,
	exerciseId: string,
	prescription: { target_sets: number; rep_min: number; rep_max: number; rir_target: number }
): Promise<void> {
	const owned = await db
		.prepare(`SELECT id FROM routine_session WHERE id = ? AND ${OWNED_SESSION}`)
		.bind(sessionId, userId)
		.first();
	if (!owned) return;
	const { results } = await db
		.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM routine_exercise WHERE session_id = ?')
		.bind(sessionId)
		.all();
	const pos = (results[0]?.pos as number) ?? 0;
	await db
		.prepare(
			'INSERT INTO routine_exercise (id, session_id, position, exercise_id, target_sets, rep_min, rep_max, rir_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(crypto.randomUUID(), sessionId, pos, exerciseId, prescription.target_sets, prescription.rep_min, prescription.rep_max, prescription.rir_target)
		.run();
}

export interface ScaffoldExercise {
	exercise_id: string;
	name: string;
	measurement: string;
	progression: string;
	equipment: string | null;
	mechanic: string | null;
	movement_pattern: string | null;
	target_sets: number;
	rep_min: number | null;
	rep_max: number | null;
	override_lb: number | null;
	bar_id: string | null;
}

/**
 * A routine day's prescriptions, for building a workout from. Null when the day
 * is not yours — this used to be raw SQL in the API route, reaching both
 * routine_session and routine_exercise by id with no ownership check at all.
 */
export async function sessionScaffold(
	db: D1Database,
	userId: number,
	sessionId: string
): Promise<{ name: string; exercises: ScaffoldExercise[] } | null> {
	const session = await db
		.prepare(`SELECT name FROM routine_session WHERE id = ? AND ${OWNED_SESSION}`)
		.bind(sessionId, userId)
		.first<{ name: string }>();
	if (!session) return null;

	const { results } = await db
		.prepare(
			`SELECT re.target_sets, re.rep_min, re.rep_max, re.increment_lb AS override_lb, re.bar_id,
			        e.id, e.name, e.measurement, e.progression, e.equipment, e.mechanic,
			        e.movement_pattern
			 FROM routine_exercise re JOIN exercise e ON e.id = re.exercise_id
			 WHERE re.session_id = ? ORDER BY re.position`
		)
		.bind(sessionId)
		.all();

	return {
		name: session.name,
		exercises: (results as Record<string, unknown>[]).map((r) => ({
			exercise_id: r.id as string,
			name: r.name as string,
			measurement: r.measurement as string,
			progression: r.progression as string,
			equipment: r.equipment as string | null,
			mechanic: r.mechanic as string | null,
			movement_pattern: r.movement_pattern as string | null,
			target_sets: r.target_sets as number,
			rep_min: r.rep_min as number | null,
			rep_max: r.rep_max as number | null,
			override_lb: r.override_lb as number | null,
			bar_id: r.bar_id as string | null
		}))
	};
}
