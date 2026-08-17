// Aggregate reads for the You tab. Every export takes userId and filters on it,
// same as the rest of the server layer — a call site that forgets does not
// compile. The arithmetic lives in src/lib/training; this file only fetches.

import type { TrainedExercise } from '../training/volume.ts';

export interface LifetimeTotals {
	workouts: number;
	sets: number;
	reps: number;
	volume_lb: number;
}

/**
 * Two queries rather than one join, so each number means what it says: a
 * workout that finished with nothing but warmups is still a workout, but it
 * contributed no sets.
 */
export async function lifetimeTotals(db: D1Database, userId: number): Promise<LifetimeTotals> {
	const [w, s] = await db.batch([
		db
			.prepare(
				'SELECT COUNT(*) AS workouts FROM workout WHERE user_id = ? AND finished_at IS NOT NULL'
			)
			.bind(userId),
		db
			.prepare(
				`SELECT COUNT(*) AS sets,
				        COALESCE(SUM(COALESCE(ws.reps, 0)), 0) AS reps,
				        COALESCE(SUM(COALESCE(ws.weight_lb, 0) * COALESCE(ws.reps, 0)), 0) AS volume_lb
				 FROM workout_set ws
				 JOIN workout w ON w.id = ws.workout_id
				 WHERE w.user_id = ? AND w.finished_at IS NOT NULL AND ws.is_warmup = 0`
			)
			.bind(userId)
	]);
	const counts = (s.results[0] ?? {}) as Record<string, number>;
	return {
		workouts: ((w.results[0] ?? {}) as Record<string, number>).workouts ?? 0,
		sets: counts.sets ?? 0,
		reps: counts.reps ?? 0,
		volume_lb: counts.volume_lb ?? 0
	};
}

/**
 * Raw start timestamps for the heatmap. Deliberately not `date(started_at)`:
 * that is UTC, and an evening session west of Greenwich would land on the
 * wrong square. The browser buckets these — see bucketByLocalDay.
 */
export async function trainingDays(db: D1Database, userId: number, weeks = 26): Promise<string[]> {
	const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString();
	const { results } = await db
		.prepare(
			`SELECT started_at FROM workout
			 WHERE user_id = ? AND finished_at IS NOT NULL AND started_at >= ?
			 ORDER BY started_at`
		)
		.bind(userId, since)
		.all<{ started_at: string }>();
	return results.map((r) => r.started_at);
}

/** What was actually trained in the last N days, shaped for actualSetsByGroup. */
export async function trainedInWindow(
	db: D1Database,
	userId: number,
	days: number
): Promise<TrainedExercise[]> {
	const since = new Date(Date.now() - days * 86_400_000).toISOString();
	const { results } = await db
		.prepare(
			`SELECT e.primary_muscles, e.secondary_muscles, e.movement_pattern, COUNT(*) AS sets
			 FROM workout_set ws
			 JOIN exercise e ON e.id = ws.exercise_id
			 JOIN workout w ON w.id = ws.workout_id
			 WHERE w.user_id = ? AND w.finished_at IS NOT NULL AND ws.is_warmup = 0
			   AND ws.completed_at >= ?
			 GROUP BY ws.exercise_id`
		)
		.bind(userId, since)
		.all<Record<string, unknown>>();
	return results.map((r) => ({
		primary_muscles: JSON.parse((r.primary_muscles as string) || '[]'),
		secondary_muscles: JSON.parse((r.secondary_muscles as string) || '[]'),
		movement_pattern: (r.movement_pattern as string | null) ?? null,
		sets: r.sets as number
	}));
}

export interface HeadlineRecord {
	exercise_id: string;
	name: string;
	measurement: string;
	movement_pattern: string | null;
	primary_muscles: string[];
	/** The single number this measurement is ranked by. */
	best: number;
	weight_lb: number | null;
	reps: number | null;
	duration_s: number | null;
	distance_m: number | null;
	completed_at: string;
}

/**
 * One row per exercise ever trained, carrying its headline record *and* the set
 * that holds it.
 *
 * The bare `ws.*` columns beside the `MAX()` are not an accident: SQLite
 * documents that with exactly one min/max aggregate in a grouped query, bare
 * columns come from the row that produced it. That is what makes this one query
 * instead of two, and stats.test.ts is what proves node:sqlite and D1 still
 * agree about it. Add a second MAX() here and the guarantee is gone.
 */
export async function headlineRecords(db: D1Database, userId: number): Promise<HeadlineRecord[]> {
	const { results } = await db
		.prepare(
			`SELECT ws.exercise_id, e.name, e.measurement, e.movement_pattern, e.primary_muscles,
			        MAX(CASE e.measurement
			              WHEN 'load_reps'     THEN ws.weight_lb * (1 + ws.reps / 30.0)
			              WHEN 'load_time'     THEN ws.weight_lb
			              WHEN 'reps_only'     THEN ws.reps
			              WHEN 'time'          THEN ws.duration_s
			              WHEN 'distance_time' THEN ws.distance_m
			            END) AS best,
			        ws.weight_lb, ws.reps, ws.duration_s, ws.distance_m, ws.completed_at
			 FROM workout_set ws
			 JOIN exercise e ON e.id = ws.exercise_id
			 JOIN workout w ON w.id = ws.workout_id
			 WHERE w.user_id = ? AND w.finished_at IS NOT NULL AND ws.is_warmup = 0
			 GROUP BY ws.exercise_id
			 HAVING best IS NOT NULL`
		)
		.bind(userId)
		.all<Record<string, unknown>>();
	return results.map((r) => ({
		...(r as unknown as HeadlineRecord),
		primary_muscles: JSON.parse((r.primary_muscles as string) || '[]')
	}));
}

export interface ExportedWorkout {
	id: string;
	routine_session_id: string | null;
	started_at: string;
	finished_at: string | null;
	notes: string | null;
	sets: Record<string, unknown>[];
}

/**
 * Everything this account has logged. The app is offline-first with no backups
 * and no password reset, so this file is the only safety net there is.
 */
export async function exportWorkouts(
	db: D1Database,
	userId: number
): Promise<{ exported_at: string; workouts: ExportedWorkout[] }> {
	const [w, s] = await db.batch([
		db.prepare('SELECT * FROM workout WHERE user_id = ? ORDER BY started_at').bind(userId),
		db
			.prepare(
				`SELECT ws.* FROM workout_set ws
				 JOIN workout w ON w.id = ws.workout_id
				 WHERE w.user_id = ? ORDER BY ws.workout_id, ws.position`
			)
			.bind(userId)
	]);
	const byWorkout = new Map<string, Record<string, unknown>[]>();
	for (const row of s.results as Record<string, unknown>[]) {
		const id = row.workout_id as string;
		if (!byWorkout.has(id)) byWorkout.set(id, []);
		byWorkout.get(id)!.push(row);
	}
	return {
		exported_at: new Date().toISOString(),
		workouts: (w.results as unknown as ExportedWorkout[]).map((row) => ({
			...row,
			sets: byWorkout.get(row.id) ?? []
		}))
	};
}
