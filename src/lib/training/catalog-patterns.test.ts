// The generator trusts movement_pattern to mean what the slot promises. These
// read the committed seed, because the misfiling lived there, not in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rows = readFileSync(new URL('../../../d1/seed.sql', import.meta.url), 'utf8')
	.split('\n')
	.filter((l) => l.startsWith('INSERT INTO exercise ('))
	.map((l) => {
		const m = l.match(/VALUES \('([^']*)','(?:[^']|'')*','[^']*',('[^']*'|NULL),'[^']*',(?:'[^']*'|NULL),'(\[[^\]]*\])'/);
		const p = l.match(/,(?:'(?:beginner|intermediate|expert)'|NULL),(\d+),/);
		assert.ok(m && p, `unparsed seed row: ${l.slice(0, 120)}`);
		return { id: m[1], pattern: m[2] === 'NULL' ? null : m[2].slice(1, -1), primary: JSON.parse(m[3]) as string[], priority: Number(p[1]) };
	});

test('every chest-press row is chest-primary', () => {
	const wrong = rows.filter((r) => (r.pattern === 'horizontal_press' || r.pattern === 'incline_press') && !r.primary.includes('chest'));
	assert.deepEqual(wrong.map((r) => r.id), []);
});

test('handstand push-ups are an overhead press', () => {
	assert.equal(rows.find((r) => r.id === 'Handstand_Push-Ups')?.pattern, 'vertical_press');
});

test('migration 0004 covers every row the seed refiled', () => {
	const sql = readFileSync(new URL('../../../d1/migrations/0004_pattern_fixes.sql', import.meta.url), 'utf8');
	for (const r of rows.filter((r) => r.pattern === 'triceps_extension' && /dip|bench|press|push-?up/i.test(r.id) && !/extension|pushdown|skull|kickback/i.test(r.id))) {
		assert.ok(sql.includes(`'${r.id}'`), `${r.id} is triceps_extension in seed.sql but not in 0004`);
	}
});

test('the pullover slot only holds lats-primary pullovers; chest ones file as flyes behind the real ones', () => {
	assert.deepEqual(rows.filter((r) => r.pattern === 'pullover' && !r.primary.includes('lats')).map((r) => r.id), []);
	const flyes = rows.filter((r) => r.pattern === 'chest_fly');
	const realTop = Math.max(...flyes.filter((r) => !/pullover/i.test(r.id)).map((r) => r.priority));
	for (const r of flyes.filter((r) => /pullover/i.test(r.id))) assert.ok(r.priority < realTop, `${r.id} at ${r.priority}`);
});

test('a bench or push-up refiled as triceps work never outranks a real extension', () => {
	// Bench Press - Powerlifting kept its chest-press 60 and became the triceps
	// isolation next to the day's dumbbell press. Close-grip bench is the one
	// deliberate triceps press.
	const extensions = rows.filter((r) => r.pattern === 'triceps_extension' && !/press|push-?up|dip/i.test(r.id));
	const floor = Math.min(...extensions.filter((r) => r.priority > 0).map((r) => r.priority).sort((a, b) => b - a).slice(0, 5));
	for (const r of rows.filter((r) => r.pattern === 'triceps_extension' && /press|push-?up/i.test(r.id) && r.id !== 'Close-Grip_Barbell_Bench_Press')) {
		assert.ok(r.priority < floor, `${r.id} at ${r.priority}, real extensions from ${floor}`);
	}
});

test('migration 0004 sets every refiled row to its seed pattern and priority', () => {
	const sql = readFileSync(new URL('../../../d1/migrations/0004_pattern_fixes.sql', import.meta.url), 'utf8');
	for (const [, pattern, priority, ids] of sql.matchAll(/SET movement_pattern = '(\w+)', priority = (\d+)\s+WHERE id IN \(([^)]*)\)/g)) {
		for (const id of ids.match(/'[^']+'/g)!.map((q) => q.slice(1, -1))) {
			const row = rows.find((r) => r.id === id);
			assert.ok(row, `${id} missing from seed`);
			assert.equal(row.pattern, pattern, id);
			assert.equal(row.priority, Number(priority), id);
		}
	}
});
