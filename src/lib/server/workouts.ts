import type { RecordSet } from '../training/records.ts';
import type { LoggedSet } from '../training/types.ts';

export interface SyncPayload {
	workout: {
		id: string;
		routine_session_id: string | null;
		started_at: string;
		finished_at: string | null;
		notes: string | null;
	};
	sets: {
		id: string;
		exercise_id: string;
		position: number;
		weight_lb: number | null;
		reps: number | null;
		duration_s: number | null;
		distance_m: number | null;
		rir: number | null;
		is_warmup: boolean;
		completed_at: string;
	}[];
}

/**
 * Idempotent ingest: every id is a client UUID, so a retried POST replaces
 * identical rows instead of duplicating them. One batch = one transaction.
 */
export async function ingestWorkout(
	db: D1Database,
	userId: number,
	payload: SyncPayload
): Promise<boolean> {
	const w = payload.workout;
	// Ids are client-generated, so a client can send one it has merely seen.
	// Ownership comes from the session and nothing in the body influences it.
	const owner = await db
		.prepare('SELECT user_id FROM workout WHERE id = ?')
		.bind(w.id)
		.first<{ user_id: number }>();
	// False, not a silent success: on a shared phone this is one person's
	// outbox draining under another's session, and a cheerful "ok" would make
	// the client delete a workout that was never stored.
	if (owner && owner.user_id !== userId) return false;

	const stmts = [
		db
			.prepare(
				'INSERT OR REPLACE INTO workout (id, routine_session_id, started_at, finished_at, notes, user_id) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(w.id, w.routine_session_id, w.started_at, w.finished_at, w.notes, userId),
		// A re-sync after an in-session edit must not leave orphaned sets behind.
		db.prepare('DELETE FROM workout_set WHERE workout_id = ?').bind(w.id)
	];
	for (const s of payload.sets) {
		stmts.push(
			db
				.prepare(
					'INSERT OR REPLACE INTO workout_set (id, workout_id, exercise_id, position, weight_lb, reps, duration_s, distance_m, rir, is_warmup, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
				)
				.bind(
					s.id,
					w.id,
					s.exercise_id,
					s.position,
					s.weight_lb,
					s.reps,
					s.duration_s,
					s.distance_m,
					s.rir,
					s.is_warmup ? 1 : 0,
					s.completed_at
				)
		);
	}
	await db.batch(stmts);
	return true;
}

/**
 * "Last time you did this", per exercise, for the two most recent workouts
 * that touched it — enough for progression's deload check.
 */
export async function lastPerformances(
	db: D1Database,
	userId: number,
	exerciseIds: string[]
): Promise<Record<string, LoggedSet[][]>> {
	if (exerciseIds.length === 0) return {};
	const marks = exerciseIds.map(() => '?').join(',');
	const { results } = await db
		.prepare(
			`SELECT ws.exercise_id, ws.workout_id, ws.weight_lb, ws.reps, ws.duration_s, ws.is_warmup, ws.completed_at, ws.position
			 FROM workout_set ws
			 JOIN workout w ON w.id = ws.workout_id
			 WHERE ws.exercise_id IN (${marks}) AND w.finished_at IS NOT NULL AND w.user_id = ?
			 ORDER BY ws.completed_at DESC
			 LIMIT 400`
		)
		.bind(...exerciseIds, userId)
		.all();

	const out: Record<string, LoggedSet[][]> = {};
	const seenWorkouts: Record<string, string[]> = {};
	for (const r of results as Record<string, unknown>[]) {
		const ex = r.exercise_id as string;
		const wid = r.workout_id as string;
		const workouts = (seenWorkouts[ex] ??= []);
		let idx = workouts.indexOf(wid);
		if (idx === -1) {
			if (workouts.length >= 2) continue; // only the last two sessions
			workouts.push(wid);
			idx = workouts.length - 1;
		}
		const sessions = (out[ex] ??= []);
		(sessions[idx] ??= []).push({
			weight_lb: r.weight_lb as number | null,
			reps: r.reps as number | null,
			duration_s: r.duration_s as number | null,
			is_warmup: !!r.is_warmup
		});
	}
	// Sets arrived newest-first; within a session they should read in logged order.
	for (const sessions of Object.values(out)) for (const s of sessions) s.reverse();
	return out;
}

/**
 * Every working set ever logged for one exercise, newest first — what the
 * records card in the guide needs, because a lifetime best genuinely depends on
 * all of them. Served by idx_set_exercise_time, and bounded by how much has
 * actually been lifted rather than by how large the catalog is.
 *
 * Deliberately not aggregate SQL: handing the rows to a pure bestRecords() is
 * what makes every record rule testable without a database.
 */
export async function exerciseSets(
	db: D1Database,
	userId: number,
	exerciseId: string
): Promise<RecordSet[]> {
	const { results } = await db
		.prepare(
			`SELECT ws.weight_lb, ws.reps, ws.duration_s, ws.distance_m, ws.completed_at
			 FROM workout_set ws
			 JOIN workout w ON w.id = ws.workout_id
			 WHERE ws.exercise_id = ? AND w.user_id = ?
			   AND w.finished_at IS NOT NULL AND ws.is_warmup = 0
			 ORDER BY ws.completed_at DESC`
		)
		.bind(exerciseId, userId)
		.all<RecordSet>();
	return results;
}

/** Sets go too — the schema cascades, but D1 needs foreign keys enabled. */
export async function deleteWorkout(db: D1Database, userId: number, id: string): Promise<void> {
	await db.batch([
		db
			.prepare(
				'DELETE FROM workout_set WHERE workout_id IN (SELECT id FROM workout WHERE id = ? AND user_id = ?)'
			)
			.bind(id, userId),
		db.prepare('DELETE FROM workout WHERE id = ? AND user_id = ?').bind(id, userId)
	]);
}

export interface WorkoutSummary {
	id: string;
	routine_session_id: string | null;
	session_name: string | null;
	started_at: string;
	finished_at: string | null;
	set_count: number;
	exercise_count: number;
	total_volume_lb: number;
}

export async function recentWorkouts(
	db: D1Database,
	userId: number,
	limit = 30
): Promise<WorkoutSummary[]> {
	const { results } = await db
		.prepare(
			`SELECT w.id, w.routine_session_id, rs.name AS session_name, w.started_at, w.finished_at,
			        COUNT(ws.id) AS set_count,
			        COUNT(DISTINCT ws.exercise_id) AS exercise_count,
			        COALESCE(SUM(CASE WHEN ws.is_warmup = 0 THEN COALESCE(ws.weight_lb, 0) * COALESCE(ws.reps, 0) END), 0) AS total_volume_lb
			 FROM workout w
			 LEFT JOIN workout_set ws ON ws.workout_id = w.id
			 LEFT JOIN routine_session rs ON rs.id = w.routine_session_id
			 WHERE w.finished_at IS NOT NULL AND w.user_id = ?
			 GROUP BY w.id ORDER BY w.started_at DESC LIMIT ?`
		)
		.bind(userId, limit)
		.all();
	return results as unknown as WorkoutSummary[];
}

export async function workoutDetail(db: D1Database, userId: number, id: string) {
	// workout_set carries no owner; it inherits one through this join.
	const [workout, sets] = await db.batch([
		db
			.prepare(
				'SELECT w.*, rs.name AS session_name FROM workout w LEFT JOIN routine_session rs ON rs.id = w.routine_session_id WHERE w.id = ? AND w.user_id = ?'
			)
			.bind(id, userId),
		db
			.prepare(
				`SELECT ws.*, e.name AS exercise_name, e.measurement FROM workout_set ws
				 JOIN exercise e ON e.id = ws.exercise_id
				 JOIN workout w ON w.id = ws.workout_id
				 WHERE ws.workout_id = ? AND w.user_id = ? ORDER BY ws.position`
			)
			.bind(id, userId)
	]);
	return { workout: workout.results[0] ?? null, sets: sets.results };
}

/** The last finished rotation position for this routine, or null. */
export async function lastCompletedPosition(
	db: D1Database,
	userId: number,
	routineId: string
): Promise<number | null> {
	const row = await db
		.prepare(
			`SELECT rs.position FROM workout w
			 JOIN routine_session rs ON rs.id = w.routine_session_id
			 WHERE rs.routine_id = ? AND w.finished_at IS NOT NULL AND w.user_id = ?
			 ORDER BY w.started_at DESC LIMIT 1`
		)
		.bind(routineId, userId)
		.first();
	return (row?.position as number | undefined) ?? null;
}

/** (muscle group source data) — primary muscles of everything trained recently. */
export async function recentTrainedMuscles(
	db: D1Database,
	userId: number,
	days = 30
): Promise<{ primary_muscles: string; completed_at: string }[]> {
	const since = new Date(Date.now() - days * 86_400_000).toISOString();
	const { results } = await db
		.prepare(
			`SELECT e.primary_muscles, ws.completed_at FROM workout_set ws
			 JOIN exercise e ON e.id = ws.exercise_id
			 JOIN workout w ON w.id = ws.workout_id
			 WHERE ws.completed_at > ? AND ws.is_warmup = 0 AND w.finished_at IS NOT NULL
			   AND w.user_id = ? AND e.movement_pattern IS NOT NULL`
		)
		.bind(since, userId)
		.all();
	return results as unknown as { primary_muscles: string; completed_at: string }[];
}
