import type { Exercise } from '$lib/training/types';

export interface ExerciseRow extends Exercise {
	mechanic: string | null;
	level: string | null;
	instructions: string | null;
	cues: string | null;
	video_id: string | null;
	image: string | null;
	aliases?: string[];
}

function rowToExercise(r: Record<string, unknown>): ExerciseRow {
	return {
		...(r as unknown as ExerciseRow),
		primary_muscles: JSON.parse((r.primary_muscles as string) || '[]'),
		secondary_muscles: JSON.parse((r.secondary_muscles as string) || '[]'),
		unilateral: !!r.unilateral
	};
}

const COLS =
	'id,name,measurement,movement_pattern,progression,equipment,primary_muscles,secondary_muscles,unilateral,mechanic,level,priority,instructions,cues,video_id,image';

export async function searchExercises(db: D1Database, q: string, limit = 25): Promise<ExerciseRow[]> {
	const trimmed = q.trim();
	if (!trimmed) return [];
	// FTS prefix query; fall back to LIKE for punctuation FTS can't chew on.
	try {
		const match = trimmed
			.split(/\s+/)
			.map((t) => t.replace(/[^\p{L}\p{N}-]/gu, ''))
			.filter(Boolean)
			.map((t) => `"${t}"*`)
			.join(' ');
		const { results } = await db
			.prepare(
				`SELECT e.${COLS.split(',').join(',e.')} FROM exercise_fts f JOIN exercise e ON e.id = f.id
				 WHERE exercise_fts MATCH ? ORDER BY e.priority DESC, rank LIMIT ?`
			)
			.bind(match, limit)
			.all();
		if (results.length > 0) return results.map(rowToExercise);
	} catch {
		// fall through to LIKE
	}
	const { results } = await db
		.prepare(`SELECT ${COLS} FROM exercise WHERE name LIKE ? ORDER BY priority DESC, name LIMIT ?`)
		.bind(`%${trimmed}%`, limit)
		.all();
	return results.map(rowToExercise);
}

export async function getExercise(db: D1Database, id: string): Promise<ExerciseRow | null> {
	const row = await db.prepare(`SELECT ${COLS} FROM exercise WHERE id = ?`).bind(id).first();
	if (!row) return null;
	const ex = rowToExercise(row as Record<string, unknown>);
	const { results } = await db
		.prepare('SELECT alias FROM exercise_alias WHERE exercise_id = ?')
		.bind(id)
		.all();
	ex.aliases = results.map((r) => r.alias as string);
	return ex;
}

/** Everything the generator may reach: patterned only, by construction. */
export async function generatorCatalog(db: D1Database): Promise<ExerciseRow[]> {
	const { results } = await db
		.prepare(`SELECT ${COLS} FROM exercise WHERE movement_pattern IS NOT NULL ORDER BY priority DESC`)
		.all();
	return results.map(rowToExercise);
}

export async function listExercises(
	db: D1Database,
	opts: { pattern?: string; equipment?: string; limit?: number; offset?: number } = {}
): Promise<ExerciseRow[]> {
	const where: string[] = [];
	const binds: unknown[] = [];
	if (opts.pattern) {
		where.push('movement_pattern = ?');
		binds.push(opts.pattern);
	}
	if (opts.equipment) {
		where.push('equipment = ?');
		binds.push(opts.equipment);
	}
	const sql =
		`SELECT ${COLS} FROM exercise` +
		(where.length ? ` WHERE ${where.join(' AND ')}` : '') +
		` ORDER BY priority DESC, name LIMIT ? OFFSET ?`;
	binds.push(opts.limit ?? 100, opts.offset ?? 0);
	const { results } = await db.prepare(sql).bind(...binds).all();
	return results.map(rowToExercise);
}
