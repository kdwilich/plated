import type { GymConfig, Bar, PlateStock } from '../training/types.ts';

export interface GymRecord extends GymConfig {
	id: string;
	name: string;
}

export async function getGym(db: D1Database, id = 'gym-default'): Promise<GymRecord> {
	const [gym, equipment, plates, bars] = await db.batch([
		db.prepare('SELECT * FROM gym WHERE id = ?').bind(id),
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

export async function saveGym(
	db: D1Database,
	gym: {
		id: string;
		name: string;
		dumbbell_step_lb: number;
		machine_step_lb: number;
		equipment: string[];
		plates: PlateStock[];
		bars: { id: string; name: string; weight_lb: number; is_default: boolean }[];
	}
): Promise<void> {
	const stmts = [
		db
			.prepare('INSERT OR REPLACE INTO gym (id, name, dumbbell_step_lb, machine_step_lb) VALUES (?, ?, ?, ?)')
			.bind(gym.id, gym.name, gym.dumbbell_step_lb, gym.machine_step_lb),
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
