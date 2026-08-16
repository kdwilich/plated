// Mobility warm-up — the half of a warm-up that happens before you touch a bar.
// warmup.ts ramps the load; this gets the lifter loose. Tailored to what the
// session actually trains, and capped short on purpose: a warm-up you skip
// because it is long is worse than a short one you do.

import type { MovementPattern } from './types.ts';

export interface MobilityDrill {
	/** Catalog id, so the row can link to /exercises/[id]. Null for the opener. */
	exercise_id: string | null;
	name: string;
	/** "10 each side", "30s", "8 slow" */
	dose: string;
	/** Why it is on today's list: "squatting and lunging today" */
	why: string;
}

type Region = 'lower' | 'upper' | 'core';

interface DrillDef {
	exercise_id: string;
	name: string;
	dose: string;
}

/** Always-on drills plus pattern drills. The opener does not count. */
const CAP = 6;

// Not catalog-backed: nothing in the dataset represents "go ride a bike", and
// it is the part of a warm-up that matters most.
const OPENER: MobilityDrill = {
	exercise_id: null,
	name: '5 min easy cardio',
	dose: 'bike, rower, or walk',
	why: 'raise your temperature'
};

const ALWAYS: DrillDef[] = [
	{ exercise_id: 'Cat_Stretch', name: 'Cat Stretch', dose: '8 slow' },
	{ exercise_id: 'Standing_Hip_Circles', name: 'Standing Hip Circles', dose: '10 each way' }
];

// Every id here must exist in data/exercises.json — mobility.test.ts enforces
// it. Static stretches, SMR and equipment-dependent entries are deliberately
// excluded: they are cool-down work, not warm-up work.
const GROUPS: { patterns: MovementPattern[]; region: Region; drills: DrillDef[] }[] = [
	{
		patterns: ['squat', 'lunge', 'leg_extension'],
		region: 'lower',
		drills: [
			{ exercise_id: 'Sit_Squats', name: 'Sit Squats', dose: '10' },
			{ exercise_id: 'Ankle_Circles', name: 'Ankle Circles', dose: '10 each' }
		]
	},
	{
		patterns: ['hip_hinge', 'leg_curl'],
		region: 'lower',
		drills: [
			{ exercise_id: 'Inchworm', name: 'Inchworm', dose: '5' },
			{ exercise_id: 'Front_Leg_Raises', name: 'Front Leg Raises', dose: '10 each side' }
		]
	},
	{
		patterns: ['hip_thrust'],
		region: 'lower',
		drills: [
			{ exercise_id: 'Kneeling_Hip_Flexor', name: 'Kneeling Hip Flexor', dose: '30s each side' }
		]
	},
	{
		patterns: ['calf_raise'],
		region: 'lower',
		drills: [
			{
				exercise_id: 'Standing_Gastrocnemius_Calf_Stretch',
				name: 'Standing Calf Stretch',
				dose: '30s each'
			}
		]
	},
	{
		patterns: ['horizontal_press', 'incline_press', 'chest_fly'],
		region: 'upper',
		drills: [
			{ exercise_id: 'Dynamic_Chest_Stretch', name: 'Dynamic Chest Stretch', dose: '10' },
			{ exercise_id: 'Arm_Circles', name: 'Arm Circles', dose: '10 each way' }
		]
	},
	{
		patterns: ['vertical_press', 'lateral_raise'],
		region: 'upper',
		drills: [
			{ exercise_id: 'Shoulder_Circles', name: 'Shoulder Circles', dose: '10 each way' },
			{
				exercise_id: 'Round_The_World_Shoulder_Stretch',
				name: 'Round The World Shoulder Stretch',
				dose: '5 each'
			}
		]
	},
	{
		patterns: ['horizontal_pull', 'vertical_pull', 'rear_delt', 'pullover', 'shrug'],
		region: 'upper',
		drills: [
			{ exercise_id: 'Dynamic_Back_Stretch', name: 'Dynamic Back Stretch', dose: '10' },
			{ exercise_id: 'Elbows_Back', name: 'Elbows Back', dose: '10' }
		]
	},
	{
		patterns: ['biceps_curl', 'triceps_extension'],
		region: 'upper',
		drills: [{ exercise_id: 'Wrist_Circles', name: 'Wrist Circles', dose: '10 each way' }]
	},
	{
		patterns: ['ab_flexion', 'anti_extension', 'loaded_carry'],
		region: 'core',
		drills: [{ exercise_id: 'Standing_Pelvic_Tilt', name: 'Standing Pelvic Tilt', dose: '10' }]
	}
];

/** Every catalog id this module can produce. Exported so the test suite can
 *  assert they all still exist — a typo here is a dead guide link in the app. */
export const MOBILITY_EXERCISE_IDS: string[] = [
	...ALWAYS.map((d) => d.exercise_id),
	...GROUPS.flatMap((g) => g.drills.map((d) => d.exercise_id))
];

const PATTERN_LABEL: Record<MovementPattern, string> = {
	horizontal_press: 'pressing',
	incline_press: 'incline pressing',
	vertical_press: 'overhead pressing',
	horizontal_pull: 'rowing',
	vertical_pull: 'pulling',
	squat: 'squatting',
	hip_hinge: 'hinging',
	hip_thrust: 'hip thrusting',
	lunge: 'lunging',
	chest_fly: 'flyes',
	lateral_raise: 'lateral raises',
	rear_delt: 'rear delt work',
	pullover: 'pullovers',
	shrug: 'shrugs',
	biceps_curl: 'curling',
	triceps_extension: 'triceps work',
	leg_curl: 'leg curls',
	leg_extension: 'leg extensions',
	calf_raise: 'calf raises',
	ab_flexion: 'ab work',
	anti_extension: 'ab work',
	loaded_carry: 'carries'
};

/** ["a"] -> "a"; ["a","b"] -> "a and b"; ["a","b","c"] -> "a, b and c" */
function listPhrase(items: string[]): string {
	if (items.length <= 1) return items[0] ?? '';
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Which region leads when the cap forces a choice. Compounds, not isolations:
// a day built on squats and hinges should surface lower-body drills first even
// if it happens to carry more upper accessories.
const COMPOUND_REGION: Partial<Record<MovementPattern, Region>> = {
	squat: 'lower',
	lunge: 'lower',
	hip_hinge: 'lower',
	hip_thrust: 'lower',
	horizontal_press: 'upper',
	incline_press: 'upper',
	vertical_press: 'upper',
	horizontal_pull: 'upper',
	vertical_pull: 'upper'
};

interface Picked {
	def: DrillDef;
	region: Region;
	labels: string[];
}

/** One triggered group's drills, in map order. */
interface Queue {
	region: Region;
	drills: Picked[];
}

export function mobility(patterns: (MovementPattern | null | undefined)[]): MobilityDrill[] {
	const present = new Set(patterns.filter((p): p is MovementPattern => Boolean(p)));

	// One queue per triggered group, collecting labels per drill id so a drill
	// triggered by two patterns says so.
	const seen = new Map<string, Picked>();
	const queues: Queue[] = [];
	for (const group of GROUPS) {
		const hits = group.patterns.filter((p) => present.has(p));
		if (hits.length === 0) continue;
		const labels = hits.map((p) => PATTERN_LABEL[p]);
		const queue: Queue = { region: group.region, drills: [] };
		for (const def of group.drills) {
			const existing = seen.get(def.exercise_id);
			if (existing) {
				for (const l of labels) if (!existing.labels.includes(l)) existing.labels.push(l);
				continue;
			}
			const drill: Picked = { def, region: group.region, labels: [...labels] };
			seen.set(def.exercise_id, drill);
			queue.drills.push(drill);
		}
		if (queue.drills.length > 0) queues.push(queue);
	}

	const lower = queues.filter((q) => q.region === 'lower');
	const upper = queues.filter((q) => q.region === 'upper');
	const core = queues.filter((q) => q.region === 'core');
	// Core joins whichever side has fewer groups, so it never crowds one out.
	(lower.length <= upper.length ? lower : upper).push(...core);

	// Lead with the region carrying more compounds, then alternate, so a
	// leg-heavy day does not spend the whole cap below the waist.
	let lowerCompounds = 0;
	let upperCompounds = 0;
	for (const p of present) {
		if (COMPOUND_REGION[p] === 'lower') lowerCompounds++;
		if (COMPOUND_REGION[p] === 'upper') upperCompounds++;
	}
	const [first, second] = lowerCompounds >= upperCompounds ? [lower, upper] : [upper, lower];
	const ordered: Queue[] = [];
	for (let i = 0; i < Math.max(first.length, second.length); i++) {
		if (i < first.length) ordered.push(first[i]);
		if (i < second.length) ordered.push(second[i]);
	}

	// Round-robin across groups, not straight down them: every movement the
	// session trains gets a drill before any movement gets a second one. Taking
	// each group's list in order instead would spend an upper day's whole cap on
	// chest and shoulders and leave a back-heavy session with nothing for the
	// back.
	const room = CAP - ALWAYS.length;
	const chosen: Picked[] = [];
	const depth = Math.max(...ordered.map((q) => q.drills.length), 0);
	for (let pass = 0; pass < depth && chosen.length < room; pass++) {
		for (const q of ordered) {
			if (chosen.length >= room) break;
			if (pass < q.drills.length) chosen.push(q.drills[pass]);
		}
	}

	// Rendered order is general -> lower -> upper, so you are not getting up and
	// down off the floor.
	const order: Record<Region, number> = { lower: 0, core: 1, upper: 2 };
	chosen.sort((a, b) => order[a.region] - order[b.region]);

	return [
		OPENER,
		...ALWAYS.map((d) => ({ ...d, why: 'every session' })),
		...chosen.map((p) => ({ ...p.def, why: `${listPhrase(p.labels)} today` }))
	];
}
