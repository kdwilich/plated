// The committed catalog, loaded the way a fresh database gets it: schema,
// every migration, then seed.sql. Bodyweight work lives or dies on what the
// seed tags, so these read the real rows rather than a fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const d1 = (p: string) => readFileSync(new URL(`../../../d1/${p}`, import.meta.url), 'utf8');

function catalog(): DatabaseSync {
	const db = new DatabaseSync(':memory:');
	db.exec(d1('schema.sql'));
	for (const m of readdirSync(new URL('../../../d1/migrations', import.meta.url)).sort()) db.exec(d1(`migrations/${m}`));
	db.exec(d1('seed.sql'));
	return db;
}

const db = catalog();
type Row = { id: string; name: string; equipment: string | null; movement_pattern: string | null; priority: number; requires_bar: number; measurement: string };
const row = (id: string) => db.prepare('SELECT * FROM exercise WHERE id = ?').get(id) as Row | undefined;

test('bar work is tagged, and floor work is not', () => {
	for (const id of ['Pullups', 'Chin-Up', 'V-Bar_Pullup', 'Hanging_Leg_Raise', 'Hanging_Pike', 'Dips_-_Triceps_Version', 'Inverted_Row']) {
		assert.equal(row(id)?.requires_bar, 1, id);
	}
	for (const id of ['Bench_Dips', 'Pushups', 'Bodyweight_Squat', 'Plank']) assert.equal(row(id)?.requires_bar, 0, id);
	const tagged = db.prepare('SELECT id, equipment FROM exercise WHERE requires_bar = 1').all() as Row[];
	for (const r of tagged) assert.equal(r.equipment, 'body only', r.id);
});

test('a strength row with no equipment in the dataset is body-only work', () => {
	for (const id of ['Inverted_Row', 'Bodyweight_Walking_Lunge', 'Decline_Push-Up', 'Floor_Glute-Ham_Raise']) {
		assert.equal(row(id)?.equipment, 'body only', id);
	}
});

test('the bodyweight patterns a floor needs are there', () => {
	const expect: Record<string, string | null> = {
		Bodyweight_Squat: 'squat',
		Bodyweight_Walking_Lunge: 'lunge',
		'Decline_Push-Up': 'incline_press',
		Inverted_Row: 'horizontal_pull',
		Natural_Glute_Ham_Raise: 'leg_curl',
		'Floor_Glute-Ham_Raise': 'leg_curl',
		'bw-bulgarian-split-squat': 'lunge',
		'bw-single-leg-rdl': 'hip_hinge',
		'bw-single-leg-calf-raise': 'calf_raise',
		'bw-pike-push-up': 'vertical_press',
		// Not floor work: a jump, a partner, a scapular drill.
		Freehand_Jump_Squat: null,
		Prone_Manual_Hamstring: null,
		'Scapular_Pull-Up': null,
		Standing_Towel_Triceps_Extension: null
	};
	for (const [id, pattern] of Object.entries(expect)) assert.equal(row(id)?.movement_pattern, pattern, id);
});

test('band exercises are reachable when bands are the equipment', () => {
	assert.equal(row('Lateral_Raise_-_With_Bands')?.movement_pattern, 'lateral_raise');
	assert.equal(row('Band_Pull_Apart')?.movement_pattern, 'rear_delt');
	assert.equal(row('Squats_-_With_Bands')?.movement_pattern, 'squat');
	// A barbell lift with bands strapped on is still a specialty variant.
	assert.equal(row('Squat_with_Bands')?.movement_pattern, null);
});

test('the staples are body-only, rep-counted, cued, and never outrank a loaded classic', () => {
	for (const id of ['bw-bulgarian-split-squat', 'bw-single-leg-rdl', 'bw-single-leg-calf-raise', 'bw-pike-push-up']) {
		const r = db.prepare('SELECT * FROM exercise WHERE id = ?').get(id) as Row & { cues: string | null };
		assert.equal(r.equipment, 'body only', id);
		assert.equal(r.measurement, 'reps_only', id);
		assert.ok(r.cues, id);
		const top = db
			.prepare("SELECT MAX(priority) p FROM exercise WHERE movement_pattern = ? AND equipment IN ('barbell','dumbbell','machine','cable')")
			.get(r.movement_pattern) as { p: number | null };
		assert.ok(top.p === null || r.priority < top.p, `${id} at ${r.priority}`);
	}
	const aliases = db.prepare("SELECT alias FROM exercise_alias WHERE exercise_id = 'Natural_Glute_Ham_Raise'").all() as { alias: string }[];
	assert.ok(aliases.some((a) => a.alias === 'Nordic Curl'));
});

test('migration 0005 sets every row it touches to what the seed says', () => {
	const sql = d1('migrations/0005_bodyweight.sql');
	const updates = [...sql.matchAll(/UPDATE exercise SET ([^;]+?)\s+WHERE id IN \(([^)]*)\);/g)];
	assert.ok(updates.length > 0);
	for (const [, sets, ids] of updates) {
		for (const id of ids.match(/'[^']+'/g)!.map((q) => q.slice(1, -1))) {
			const r = row(id) as unknown as Record<string, unknown>;
			assert.ok(r, `${id} missing from seed`);
			for (const [, col, val] of sets.matchAll(/(\w+) = ('[^']*'|NULL|\d+)/g)) {
				const want = val === 'NULL' ? null : val.startsWith("'") ? val.slice(1, -1) : Number(val);
				assert.equal(r[col], want, `${id}.${col}`);
			}
		}
	}
});

test('migration 0005 tags every bar row and inserts every staple', () => {
	const sql = d1('migrations/0005_bodyweight.sql');
	for (const r of db.prepare('SELECT id FROM exercise WHERE requires_bar = 1').all() as Row[]) {
		assert.ok(sql.includes(`'${r.id}'`), `${r.id} is requires_bar in seed.sql but not in 0005`);
	}
	for (const r of db.prepare("SELECT id FROM exercise WHERE id LIKE 'bw-%'").all() as Row[]) {
		assert.ok(sql.includes(`INSERT OR IGNORE INTO exercise (`) && sql.includes(`'${r.id}'`), r.id);
	}
});

test('migration 0005 gives every gym with bodyweight work the bar, and only those', () => {
	// The column would otherwise take pull-ups away from a gym that had them
	// the moment it deployed.
	const live = new DatabaseSync(':memory:');
	live.exec(d1('schema.sql'));
	for (const m of ['0001_multi_user', '0002_runs', '0003_seed_run', '0004_pattern_fixes']) live.exec(d1(`migrations/${m}.sql`));
	live.exec(`INSERT INTO gym (id, name) VALUES ('home', 'Home'), ('garage', 'Garage');
		INSERT INTO gym_equipment (gym_id, equipment_key) VALUES ('home', 'body only'), ('home', 'dumbbell'), ('garage', 'barbell');`);
	live.exec(d1('migrations/0005_bodyweight.sql'));
	const keys = (gym: string) =>
		(live.prepare('SELECT equipment_key k FROM gym_equipment WHERE gym_id = ? ORDER BY k').all(gym) as { k: string }[]).map((r) => r.k);
	assert.deepEqual(keys('home'), ['body only', 'dumbbell', 'pull-up bar']);
	assert.deepEqual(keys('garage'), ['barbell']);
});
