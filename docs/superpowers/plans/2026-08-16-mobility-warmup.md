# Session Mobility Warm-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a short, session-tailored mobility list at the top of every workout, so the lifter gets warm and not just the bar.

**Architecture:** A pure function `mobility(patterns)` in the training core maps the session's movement patterns onto a curated table of catalog exercise ids, dedupes, and caps the result at six drills. A Svelte component renders it above the first exercise on `/workout`, with checked ids stored on the local IndexedDB session and never synced. Getting `movement_pattern` into the active session is a prerequisite and is Task 1.

**Tech Stack:** TypeScript, SvelteKit 2 / Svelte 5 (runes), `node --test` for the pure core, D1 + IndexedDB, SCSS.

**Spec:** `docs/superpowers/specs/2026-08-16-mobility-warmup-design.md`

**Conventions that matter here:**
- Everything under `src/lib/training/` is pure — no DOM, no D1, no `$lib` imports — and imports siblings with an explicit `.ts` extension (see `warmup.ts`). Breaking this breaks `npm test`.
- `npm test` runs `node --test "src/lib/training/**/*.test.ts"`. Tests use `node:test` + `node:assert/strict`.
- Svelte 5 runes (`$state`, `$derived`, `$props`), not stores.
- Commit after every task.

---

### Task 1: Plumb `movement_pattern` into the active session

`mobility()` has no input until this lands. `ExerciseRow` already extends `Exercise`, so the field exists in the catalog layer — it is simply dropped on the way to the client.

**Files:**
- Modify: `src/lib/client/session.ts:21-35`
- Modify: `src/routes/api/session-start/+server.ts:19-63`
- Modify: `src/routes/api/exercise-context/+server.ts:20-33`

- [ ] **Step 1: Add the field to `ActiveExercise`**

In `src/lib/client/session.ts`, change the import on line 6 and add the field:

```ts
import type { LoggedSet, MovementPattern } from '$lib/training/types';
```

```ts
export interface ActiveExercise {
	exercise_id: string;
	name: string;
	measurement: string;
	progression: string;
	equipment: string | null;
	mechanic: string | null;
	/** Drives the mobility warm-up. Optional: sessions stored before this
	 *  existed will not have it, and must keep working. */
	movement_pattern?: MovementPattern | null;
	target_sets: number;
	// ...rest unchanged
}
```

- [ ] **Step 2: Select it in `/api/session-start`**

Add `e.movement_pattern` to the SELECT (line 42) and to the local `exercises` type and mapping:

```ts
					        e.id, e.name, e.measurement, e.progression, e.equipment, e.mechanic, e.movement_pattern
```

In the `exercises` type annotation (line 19-31) add:

```ts
			movement_pattern: string | null;
```

In the `.map()` (line 48-63) add, next to `mechanic`:

```ts
				movement_pattern: r.movement_pattern as string | null,
```

- [ ] **Step 3: Return it from `/api/exercise-context`**

In the `json({...})` response, next to `mechanic: ex.mechanic,`:

```ts
		movement_pattern: ex.movement_pattern,
```

- [ ] **Step 4: Verify types**

Run: `npm run check`
Expected: no new errors. (Pre-existing warnings in unrelated files are fine — compare against a run on `main` if unsure.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/session.ts src/routes/api/session-start/+server.ts src/routes/api/exercise-context/+server.ts
git commit -m "change(session): carry movement_pattern into the active session"
```

---

### Task 2: The mobility map and selection

**Files:**
- Create: `src/lib/training/mobility.ts`
- Test: `src/lib/training/mobility.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/training/mobility.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mobility } from './mobility.ts';
import type { MovementPattern } from './types.ts';

const FULL_BODY: MovementPattern[] = [
	'squat', 'hip_thrust', 'horizontal_press', 'vertical_pull', 'lateral_raise', 'biceps_curl'
];

test('the cardio opener is always first and never links to a guide', () => {
	for (const patterns of [[], FULL_BODY, ['squat'] as MovementPattern[]]) {
		const list = mobility(patterns);
		assert.equal(list[0].exercise_id, null);
		assert.match(list[0].name, /cardio/i);
	}
});

test('an empty session still gets the always-on drills', () => {
	const list = mobility([]);
	const ids = list.map((d) => d.exercise_id);
	assert.deepEqual(ids, [null, 'Cat_Stretch', 'Standing_Hip_Circles']);
});

test('a full body session is capped at six drills and covers both regions', () => {
	const list = mobility(FULL_BODY);
	const drills = list.filter((d) => d.exercise_id !== null);
	assert.equal(drills.length, 6, 'opener excluded, always-on included');

	const ids = new Set(drills.map((d) => d.exercise_id));
	const lower = ['Sit_Squats', 'Ankle_Circles', 'Inchworm', 'Front_Leg_Raises', 'Kneeling_Hip_Flexor'];
	const upper = ['Dynamic_Chest_Stretch', 'Arm_Circles', 'Shoulder_Circles', 'Dynamic_Back_Stretch', 'Elbows_Back'];
	assert.ok(lower.some((id) => ids.has(id)), 'no lower-body drill survived the cap');
	assert.ok(upper.some((id) => ids.has(id)), 'no upper-body drill survived the cap');
});

test('a pull-only session gets no leg drills beyond the always-on pair', () => {
	const list = mobility(['vertical_pull', 'horizontal_pull', 'biceps_curl']);
	const ids = list.map((d) => d.exercise_id);
	for (const legOnly of ['Sit_Squats', 'Ankle_Circles', 'Inchworm', 'Front_Leg_Raises', 'Kneeling_Hip_Flexor']) {
		assert.ok(!ids.includes(legOnly), `${legOnly} has no business on a pull day`);
	}
	assert.ok(ids.includes('Dynamic_Back_Stretch'));
});

test('a drill triggered by two patterns names both', () => {
	const list = mobility(['squat', 'lunge']);
	const sitSquats = list.find((d) => d.exercise_id === 'Sit_Squats');
	assert.ok(sitSquats);
	assert.match(sitSquats.why, /squatting/);
	assert.match(sitSquats.why, /lunging/);
});

test('no duplicate exercise ids', () => {
	const ids = mobility(FULL_BODY).map((d) => d.exercise_id).filter((id) => id !== null);
	assert.equal(new Set(ids).size, ids.length);
});

test('null and undefined patterns are ignored, not crashed on', () => {
	const list = mobility([null, undefined, 'squat']);
	assert.ok(list.some((d) => d.exercise_id === 'Sit_Squats'));
});

test('deterministic: the same patterns produce the same list', () => {
	assert.deepEqual(mobility(FULL_BODY), mobility(FULL_BODY));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './mobility.ts'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/training/mobility.ts`:

```ts
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

/** Always-on drills plus this many pattern drills is the whole list. */
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
// excluded: they are cool-down work.
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
		drills: [{ exercise_id: 'Kneeling_Hip_Flexor', name: 'Kneeling Hip Flexor', dose: '30s each side' }]
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

export function mobility(patterns: (MovementPattern | null | undefined)[]): MobilityDrill[] {
	const present = new Set(patterns.filter((p): p is MovementPattern => Boolean(p)));

	// Collect labels per drill id so a drill triggered by two patterns says so.
	const picked = new Map<string, { def: DrillDef; region: Region; labels: string[] }>();
	for (const group of GROUPS) {
		const hits = group.patterns.filter((p) => present.has(p));
		if (hits.length === 0) continue;
		const labels = hits.map((p) => PATTERN_LABEL[p]);
		for (const def of group.drills) {
			const existing = picked.get(def.exercise_id);
			if (existing) {
				for (const l of labels) if (!existing.labels.includes(l)) existing.labels.push(l);
				continue;
			}
			picked.set(def.exercise_id, { def, region: group.region, labels: [...labels] });
		}
	}

	const lower = [...picked.values()].filter((p) => p.region === 'lower');
	const upper = [...picked.values()].filter((p) => p.region === 'upper');
	const core = [...picked.values()].filter((p) => p.region === 'core');
	// Core drills join whichever side has less, so they never crowd a region out.
	(lower.length <= upper.length ? lower : upper).push(...core);

	// Alternate between regions when filling, so a leg-heavy full body day does
	// not spend the whole cap below the waist.
	let lowerCompounds = 0;
	let upperCompounds = 0;
	for (const p of present) {
		if (COMPOUND_REGION[p] === 'lower') lowerCompounds++;
		if (COMPOUND_REGION[p] === 'upper') upperCompounds++;
	}
	const [first, second] = lowerCompounds >= upperCompounds ? [lower, upper] : [upper, lower];

	const room = CAP - ALWAYS.length;
	const chosen: typeof lower = [];
	for (let i = 0; chosen.length < room && (i < first.length || i < second.length); i++) {
		if (i < first.length && chosen.length < room) chosen.push(first[i]);
		if (i < second.length && chosen.length < room) chosen.push(second[i]);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all eight new tests plus the existing suite.

- [ ] **Step 5: Commit**

```bash
git add src/lib/training/mobility.ts src/lib/training/mobility.test.ts
git commit -m "feat(training): session-tailored mobility warm-up"
```

---

### Task 3: Guard the catalog ids against drift

Separate task because it is a different kind of test — it reads the dataset off disk rather than exercising the function, and it is the one that catches a typo silently producing a dead guide link.

**Files:**
- Modify: `src/lib/training/mobility.ts` (export the ids)
- Modify: `src/lib/training/mobility.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/training/mobility.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { MOBILITY_EXERCISE_IDS } from './mobility.ts';

test('every mapped drill exists in the exercise catalog', () => {
	const catalog = JSON.parse(readFileSync(new URL('../../../data/exercises.json', import.meta.url), 'utf8'));
	const ids = new Set((catalog as { id: string }[]).map((e) => e.id));
	const missing = MOBILITY_EXERCISE_IDS.filter((id) => !ids.has(id));
	assert.deepEqual(missing, [], `mapped ids not in the catalog: ${missing.join(', ')}`);
});

test('the map covers every movement pattern in the catalog', () => {
	// A pattern with no drills is not an error, but it should be a deliberate
	// choice rather than an oversight — this asserts the ones we care about.
	for (const p of ['squat', 'hip_hinge', 'horizontal_press', 'vertical_pull']) {
		const list = mobility([p as MovementPattern]);
		assert.ok(list.length > 3, `${p} contributed no drills of its own`);
	}
});
```

Note the path: `src/lib/training/` to the repo root is three levels up.

- [ ] **Step 2: Export the id list from `mobility.ts`**

Add after the `GROUPS` declaration:

```ts
/** Every catalog id this module can produce. Exported so the test suite can
 *  assert they all still exist — a typo here is a dead guide link in the app. */
export const MOBILITY_EXERCISE_IDS: string[] = [
	...ALWAYS.map((d) => d.exercise_id),
	...GROUPS.flatMap((g) => g.drills.map((d) => d.exercise_id))
];
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS. If the catalog test fails, the id is wrong — grep `data/exercises.json` for the correct one rather than deleting the assertion.

- [ ] **Step 4: Commit**

```bash
git add src/lib/training/mobility.ts src/lib/training/mobility.test.ts
git commit -m "test(training): assert every mobility drill exists in the catalog"
```

---

### Task 4: Store checked drills on the active session

**Files:**
- Modify: `src/lib/client/session.ts:37-51`

- [ ] **Step 1: Add the field to `ActiveSession`**

```ts
export interface ActiveSession {
	id: string;
	routine_session_id: string | null;
	session_name: string;
	started_at: string;
	finished_at: string | null;
	notes: string | null;
	exercises: ActiveExercise[];
	sets: ActiveSet[];
	/** Mobility drills ticked off this session. Local only — never synced to
	 *  D1, never in history, invisible to volume and progression. */
	mobility_done?: string[];
	gym: {
		// ...unchanged
	};
}
```

Optional on purpose: sessions already in IndexedDB do not have it.

- [ ] **Step 2: Confirm it cannot leak to the server**

Read `toPayload()` (`src/lib/client/session.ts:116`). It builds its result field by field from `workout` and `sets` — it does not spread the session — so `mobility_done` cannot reach `/api/sync`. No change needed. If that function is ever rewritten to spread, this guarantee goes with it.

- [ ] **Step 3: Verify types**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/client/session.ts
git commit -m "change(session): track checked-off mobility drills locally"
```

---

### Task 5: The warm-up card component

**Files:**
- Create: `src/lib/components/WarmupCard.svelte`

Read `src/lib/components/PlateBar.svelte` first for the house style: Svelte 5 runes, `$props()`, scoped SCSS, existing `card` / `label` / `num` / `hairline-row` classes.

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	import type { MobilityDrill } from '$lib/training/mobility';

	let {
		drills,
		done = [],
		ontoggle
	}: {
		drills: MobilityDrill[];
		done: string[];
		ontoggle: (key: string) => void;
	} = $props();

	// The opener has no catalog id, so it needs a stable key of its own.
	const keyOf = (d: MobilityDrill) => d.exercise_id ?? `_${d.name}`;

	let allDone = $derived(drills.length > 0 && drills.every((d) => done.includes(keyOf(d))));
	let collapsed = $state(false);

	// Collapse once, when the last one is ticked — but leave it reopenable.
	$effect(() => {
		if (allDone) collapsed = true;
	});
</script>

<section class="warmup card" class:done={allDone}>
	<button class="warmup-head" onclick={() => (collapsed = !collapsed)}>
		<span class="label">Warm up</span>
		{#if allDone && collapsed}
			<span class="num status">Warmed up ✓</span>
		{:else}
			<span class="num status">{done.length}/{drills.length}</span>
		{/if}
	</button>

	{#if !collapsed}
		<ul class="drills">
			{#each drills as d (keyOf(d))}
				{@const key = keyOf(d)}
				{@const checked = done.includes(key)}
				<li class="hairline-row" class:checked>
					<button class="tick" onclick={() => ontoggle(key)} aria-pressed={checked} aria-label={d.name}>
						<span class="box" aria-hidden="true">{checked ? '✓' : ''}</span>
						<span class="drill-main">
							<span class="drill-name">{d.name}</span>
							<span class="why label">{d.why}</span>
						</span>
						<span class="num dose">{d.dose}</span>
					</button>
					{#if d.exercise_id}
						<a class="guide-link" href="/exercises/{d.exercise_id}" aria-label="{d.name} guide" title="Exercise guide">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<circle cx="12" cy="12" r="9" />
								<line x1="12" y1="11" x2="12" y2="16.5" />
								<circle cx="12" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
							</svg>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style lang="scss">
	.warmup-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		width: 100%;
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.drills {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
	}

	.hairline-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tick {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
		background: none;
		border: 0;
		padding: 0.5rem 0;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.box {
		flex: none;
		display: grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border: 1px solid currentColor;
		border-radius: 0.25rem;
		opacity: 0.6;
		font-size: 0.8rem;
	}

	.checked .box {
		opacity: 1;
	}

	.checked .drill-name {
		text-decoration: line-through;
		opacity: 0.6;
	}

	.drill-main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.why {
		opacity: 0.6;
	}

	.dose {
		flex: none;
		opacity: 0.8;
	}

	.guide-link {
		flex: none;
		display: grid;
		place-items: center;
		padding: 0.25rem;
		color: inherit;
		opacity: 0.5;
	}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check`
Expected: no new errors. If `card`, `label`, `num` or `hairline-row` are global classes defined elsewhere, Svelte may warn about unused local selectors — match whatever `PlateBar.svelte` does rather than inventing a new convention.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/WarmupCard.svelte
git commit -m "feat(components): warm-up card"
```

---

### Task 6: Wire the card into the workout page

**Files:**
- Modify: `src/routes/workout/+page.svelte` (imports ~line 16-20, template ~line 185)

- [ ] **Step 1: Import and derive**

Add to the imports:

```ts
	import { mobility } from '$lib/training/mobility';
	import WarmupCard from '$lib/components/WarmupCard.svelte';
```

Add after the `let finishing = $state(false);` declaration:

```ts
	// Recomputes as exercises are added, so a freestyle session's list grows
	// with it instead of staying empty.
	let drills = $derived(mobility((session?.exercises ?? []).map((e) => e.movement_pattern)));

	async function toggleDrill(key: string) {
		if (!session) return;
		const done = session.mobility_done ?? [];
		session.mobility_done = done.includes(key) ? done.filter((k) => k !== key) : [...done, key];
		await saveActive(session);
	}
```

- [ ] **Step 2: Render it above the first exercise**

In the template, between the `</header>` (line 185) and the `{#each session.exercises ...}` (line 187):

```svelte
	<WarmupCard {drills} done={session.mobility_done ?? []} ontoggle={toggleDrill} />
```

- [ ] **Step 3: Verify types**

Run: `npm run check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/workout/+page.svelte
git commit -m "feat(workout): show the mobility warm-up at the top of the session"
```

---

### Task 7: Verify it in the running app

Unit tests cover the selection logic; they cannot tell you the card is usable at the top of a real session.

- [ ] **Step 1: Full check**

Run: `npm test && npm run check`
Expected: both clean.

- [ ] **Step 2: Start the dev server**

Use the preview tooling (`preview_start`) rather than a bare `npm run dev`. If `.claude/launch.json` has no plateload entry, add one: `runtimeExecutable: "npm"`, `runtimeArgs: ["run","dev"]`, `port: 5173`.

- [ ] **Step 3: Walk a session**

Start a workout from a generated routine and confirm:
- The card sits above the first exercise, opener first.
- Drills match the day — a Legs session shows Sit Squats / Ankle Circles, a Pull session shows Dynamic Back Stretch / Elbows Back.
- Six drills maximum, opener excluded from that count.
- Tapping a row ticks it; reloading the page keeps the ticks (they are in IndexedDB).
- Ticking the last one collapses the card to "Warmed up ✓", and it reopens on tap.
- A drill name opens its guide at `/exercises/[id]`; the opener has no link.
- Finishing the session and checking `/history` shows **no** mobility rows.

- [ ] **Step 4: Check the console**

Read console messages and server logs. Expected: no errors.

- [ ] **Step 5: Commit any fixes**

```bash
git commit -am "fix(workout): <whatever the walkthrough turned up>"
```

---

## Done when

- `npm test` and `npm run check` are clean.
- A real session shows a correct, tappable, guide-linked warm-up card.
- Mobility work appears nowhere in history, weekly volume, or progression.
