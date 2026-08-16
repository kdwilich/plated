import type { RoutineDraft } from '$lib/training/types';
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

export async function getActiveRoutine(db: D1Database): Promise<RoutineRow | null> {
	const routine = await db
		.prepare('SELECT * FROM routine WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1')
		.first();
	if (!routine) return null;
	return hydrateRoutine(db, routine as Record<string, unknown>);
}

export async function getRoutine(db: D1Database, id: string): Promise<RoutineRow | null> {
	const routine = await db.prepare('SELECT * FROM routine WHERE id = ?').bind(id).first();
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

/** Persist a generated (or hand-built) draft as the new active routine. */
export async function saveRoutineFromDraft(
	db: D1Database,
	draft: RoutineDraft,
	name: string,
	gymId: string
): Promise<string> {
	const routineId = crypto.randomUUID();
	const stmts = [
		db.prepare('UPDATE routine SET is_active = 0 WHERE is_active = 1'),
		db
			.prepare('INSERT INTO routine (id, name, profile_key, gym_id, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)')
			.bind(routineId, name, draft.profile_key, gymId, new Date().toISOString())
	];
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

export async function updateRoutineExercise(
	db: D1Database,
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
	binds.push(id);
	await db.prepare(`UPDATE routine_exercise SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
}

export async function deleteRoutineExercise(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM routine_exercise WHERE id = ?').bind(id).run();
}

export async function addRoutineExercise(
	db: D1Database,
	sessionId: string,
	exerciseId: string,
	prescription: { target_sets: number; rep_min: number; rep_max: number; rir_target: number }
): Promise<void> {
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
