import type { Exercise } from '$lib/training/types';
import { matchesFilter, type ExerciseFilter } from '$lib/training/filters';
import { musclesInGroup } from '$lib/training/volume';

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

/**
 * The picker's one query: free text, muscle group, force, equipment — any
 * combination, any of them absent.
 *
 * SQL narrows on what it can index or LIKE; the final say belongs to
 * `matchesFilter`, so the picker and the pure core can never disagree about
 * whether a lat pulldown is "back". Nothing here matters at 873 rows except
 * keeping that single source of truth.
 */
export async function findExercises(
	db: D1Database,
	opts: ExerciseFilter & { q?: string; limit?: number }
): Promise<ExerciseRow[]> {
	const limit = opts.limit ?? 30;
	const filter: ExerciseFilter = { group: opts.group, force: opts.force, equipment: opts.equipment };

	if (opts.q?.trim()) {
		// Search ranks by relevance; over-fetch so filters have something to cut.
		const hits = await searchExercises(db, opts.q, 200);
		return hits.filter((e) => matchesFilter(e, filter)).slice(0, limit);
	}

	const where: string[] = [];
	const binds: unknown[] = [];
	if (opts.equipment) {
		where.push('equipment = ?');
		binds.push(opts.equipment);
	}
	if (opts.group) {
		const muscles = musclesInGroup(opts.group);
		if (muscles.length === 0) return [];
		where.push(`(${muscles.map(() => 'primary_muscles LIKE ?').join(' OR ')})`);
		binds.push(...muscles.map((m) => `%"${m}"%`));
	}
	// Force has no column to sit in — it is derived, so JS does that pass.
	if (where.length === 0 && !opts.force) return [];

	const { results } = await db
		.prepare(
			`SELECT ${COLS} FROM exercise` +
				(where.length ? ` WHERE ${where.join(' AND ')}` : '') +
				' ORDER BY priority DESC, name COLLATE NOCASE'
		)
		.bind(...binds)
		.all();
	return results
		.map(rowToExercise)
		.filter((e) => matchesFilter(e, filter))
		.slice(0, limit);
}

/** The whole catalog, for the ranking functions to score against. */
export async function allExercises(db: D1Database): Promise<ExerciseRow[]> {
	const { results } = await db.prepare(`SELECT ${COLS} FROM exercise`).all();
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
	// Alphabetical: this feeds the browse list, where you are looking a name
	// up. Search results stay ranked by priority, which is a relevance order.
	const sql =
		`SELECT ${COLS} FROM exercise` +
		(where.length ? ` WHERE ${where.join(' AND ')}` : '') +
		` ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`;
	binds.push(opts.limit ?? 100, opts.offset ?? 0);
	const { results } = await db.prepare(sql).bind(...binds).all();
	return results.map(rowToExercise);
}
