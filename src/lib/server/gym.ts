import type { GymConfig, Bar, PlateStock } from '../training/types.ts';

export interface GymRecord extends GymConfig {
	id: string;
	name: string;
}

export interface GymInput {
	id: string;
	name: string;
	dumbbell_step_lb: number;
	machine_step_lb: number;
	equipment: string[];
	plates: PlateStock[];
	bars: { id: string; name: string; weight_lb: number; is_default: boolean }[];
}

/**
 * The signed-in user's gym, created on first sight. It used to be a single row
 * with a hardcoded id that seed.sql guaranteed; nothing guarantees it now, and
 * returning a hollow default would leave someone logging lifts against a gym
 * with no plates in it.
 */
export async function getGym(db: D1Database, userId: number): Promise<GymRecord> {
	const existing = await db
		.prepare('SELECT id FROM gym WHERE user_id = ? ORDER BY id LIMIT 1')
		.bind(userId)
		.first<{ id: string }>();
	const id = existing?.id ?? (await bootstrapUser(db, userId));

	const [gym, equipment, plates, bars] = await db.batch([
		db.prepare('SELECT * FROM gym WHERE id = ? AND user_id = ?').bind(id, userId),
		db.prepare('SELECT equipment_key FROM gym_equipment WHERE gym_id = ?').bind(id),
		db.prepare('SELECT denomination_lb, pairs FROM gym_plate WHERE gym_id = ? ORDER BY denomination_lb DESC').bind(id),
		db.prepare('SELECT id, name, weight_lb, is_default FROM gym_bar WHERE gym_id = ? ORDER BY is_default DESC, weight_lb DESC').bind(id)
	]);
	const g = gym.results[0] as
		| { id: string; name: string; dumbbell_step_lb: number; machine_step_lb: number }
		| undefined;
	const barRows = bars.results as unknown as {
		id: string;
		name: string;
		weight_lb: number;
		is_default: number;
	}[];
	return {
		id: g?.id ?? id,
		name: g?.name ?? 'My gym',
		dumbbell_step_lb: g?.dumbbell_step_lb ?? 5,
		machine_step_lb: g?.machine_step_lb ?? 10,
		equipment: (equipment.results as Record<string, unknown>[]).map((r) => r.equipment_key as string),
		plates: plates.results as unknown as PlateStock[],
		bars: barRows.map((b): Bar => ({ ...b, is_default: !!b.is_default }))
	};
}

/**
 * A new account's starting gym. This used to be seven rows in seed.sql, where
 * per-user data never belonged. Returns the gym's id.
 *
 * Idempotent, and that matters at exactly one moment: the first account to sign
 * up inherits everything written before accounts existed, gym included. An
 * unconditional bootstrap would hand it a second, empty gym and leave getGym
 * choosing between the two by id — which is to say arbitrarily.
 */
export async function bootstrapUser(db: D1Database, userId: number): Promise<string> {
	const existing = await db
		.prepare('SELECT id FROM gym WHERE user_id = ? ORDER BY id LIMIT 1')
		.bind(userId)
		.first<{ id: string }>();
	if (existing) return existing.id;

	const id = `gym-${crypto.randomUUID()}`;
	await saveGym(db, userId, {
		id,
		name: 'My gym',
		dumbbell_step_lb: 5,
		machine_step_lb: 10,
		equipment: [
			'barbell',
			'dumbbell',
			'machine',
			'cable',
			'body only',
			'e-z curl bar',
			'kettlebells'
		],
		plates: [45, 35, 25, 10, 5, 2.5].map((d) => ({
			denomination_lb: d,
			pairs: d >= 25 ? 10 : 4
		})),
		// Suffixed with the gym id because these used to derive from the bar's
		// name alone — bar-straight-bar for everyone — and gym_bar's primary key
		// is shared across accounts.
		bars: [
			{ id: `bar-straight-${id}`, name: 'Straight bar', weight_lb: 45, is_default: true },
			{ id: `bar-ez-${id}`, name: 'EZ curl', weight_lb: 25, is_default: false }
		]
	});
	return id;
}

export async function saveGym(db: D1Database, userId: number, gym: GymInput): Promise<void> {
	// The id arrives from a form. INSERT OR REPLACE on a caller-supplied id is
	// exactly how one account would overwrite another's gym.
	const owner = await db
		.prepare('SELECT user_id FROM gym WHERE id = ?')
		.bind(gym.id)
		.first<{ user_id: number }>();
	if (owner && owner.user_id !== userId) throw new Error('That gym belongs to someone else.');

	const stmts = [
		db
			.prepare('INSERT OR REPLACE INTO gym (id, name, dumbbell_step_lb, machine_step_lb, user_id) VALUES (?, ?, ?, ?, ?)')
			.bind(gym.id, gym.name, gym.dumbbell_step_lb, gym.machine_step_lb, userId),
		db.prepare('DELETE FROM gym_equipment WHERE gym_id = ?').bind(gym.id),
		db.prepare('DELETE FROM gym_plate WHERE gym_id = ?').bind(gym.id),
		db.prepare('DELETE FROM gym_bar WHERE gym_id = ?').bind(gym.id)
	];
	for (const eq of gym.equipment) {
		stmts.push(db.prepare('INSERT INTO gym_equipment (gym_id, equipment_key) VALUES (?, ?)').bind(gym.id, eq));
	}
	for (const p of gym.plates) {
		stmts.push(
			db.prepare('INSERT INTO gym_plate (gym_id, denomination_lb, pairs) VALUES (?, ?, ?)').bind(gym.id, p.denomination_lb, p.pairs)
		);
	}
	for (const b of gym.bars) {
		stmts.push(
			db
				.prepare('INSERT INTO gym_bar (id, gym_id, name, weight_lb, is_default) VALUES (?, ?, ?, ?, ?)')
				.bind(b.id, gym.id, b.name, b.weight_lb, b.is_default ? 1 : 0)
		);
	}
	await db.batch(stmts);
}
