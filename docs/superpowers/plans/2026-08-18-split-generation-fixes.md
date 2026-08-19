# Split Generation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the generator produce a defensible routine at every day count, split style and emphasis — by first making its volume numbers true, then fixing the four rules that read off those numbers.

**Architecture:** Everything here lives in the pure training core (`src/lib/training/`), which runs under `node --test` with no database. Task 1–2 fix *accounting*: what a set is worth and what a muscle group is. Tasks 3–7 fix *decisions*: which exercise a slot gets, which slot emphasis cuts, and how extra sets are distributed. The order matters — Tasks 3–7 all assert on numbers that Tasks 1–2 change, so writing them first would mean writing them twice.

**Status:** Tasks 1-7 landed on `fix/volume-accounting` (commits `90eca3e`, `ca0b1a9`, `b272f26`, `72216b6`, `5bbcd3e`, `5dbf4ea`). Tasks 6 and 7 shipped together — lowering the per-exercise caps changed which groups fall short, so the shortfall warning had to land in the same commit to keep the suite green. Task 8 landed too (`7eb23b9`), along with two UI bugs found by verifying in the browser rather than by tests: the volume table flagged traps as short of a target it does not have (`ca89667`), and the two new filter chips rendered blank (`88616a4`). All tasks complete.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Cloudflare Workers + D1, `node --test` with TypeScript strip-only mode.

**Origin:** Reproduced from a real generated routine — 3 days / targeted / hypertrophy / emphasis `upper` — which shipped a 29-set push day, biceps curls on push, lateral raises on pull, and zero hamstring-primary work. Two independent LLM reviews of that routine each identified real defects; every one traced to code, not to taste.

---

## Ground rules

Read these before Task 1. They are the things that have already cost time on this repo.

1. **The shell resets its working directory between calls.** Begin every command with `cd /Volumes/home/docker/plateload`.
2. **Work on the `fix/volume-accounting` branch.** Pushing `main` deploys to production automatically.
3. **Never run `npm run deploy`.** Deployment happens by pushing `main`.
4. **`git add -A` has swept the wrong files into a commit on this repo before.** Stage explicit paths.
5. **Baseline before this work: 122 training + 85 server + 8 client = 215 passing. After all tasks: 144 + 85 + 8 = 237.** `npm test` runs all three.
6. **Node runs TypeScript in strip-only mode.** No `$lib` imports in anything under test — use relative paths with explicit `.ts` extensions.
7. **The unit-test catalog in `generate.test.ts` is kinder than reality.** Its `hip_hinge` entries are `hamstrings`-primary; the real catalog's top hinge is Barbell Deadlift, which is `lower back`-primary. This single divergence is why the suite never caught Task 4 and Task 5. When a task says "assert against the real shape", it means: make the fixture match the real catalog, then fix the code.

---

## Verifying against the real catalog

Several tasks need the actual seeded catalog, not the unit fixture. Build it once:

```bash
cd /Volumes/home/docker/plateload
sqlite3 /tmp/plateload-catalog.db < d1/schema.sql
sqlite3 /tmp/plateload-catalog.db < d1/seed.sql
sqlite3 /tmp/plateload-catalog.db -json \
  "select id,name,measurement,movement_pattern,progression,equipment,primary_muscles,secondary_muscles,unilateral,mechanic,level,priority from exercise where movement_pattern is not null order by priority desc" \
  > /tmp/plateload-catalog.json
```

This is a scratch verification aid. It is **not** committed and **not** a test fixture — the committed suite stays hermetic.

---

## File structure

**Modified — pure core:**

| File | Change |
|---|---|
| `src/lib/training/volume.ts` | Per-exercise group credit (Task 1); `traps` and `lower back` leave the `back` group; new `DISPLAY_GROUPS` export (Task 2) |
| `src/lib/training/generate.ts` | Emphasis extras honour session force (Task 3); de-emphasis cut guard (Task 4); hinge selection (Task 5); top-up distribution and caps (Task 6); ceilings and under-min warning (Task 7) |
| `src/lib/training/filters.ts` | `GROUP_FORCE` gains `traps` and `lower back` (Task 2) |

**Modified — UI, display only:**

| File | Change |
|---|---|
| `src/lib/components/ExercisePicker.svelte` | Filter chips read `DISPLAY_GROUPS` (Task 2) |
| `src/routes/you/stats/+page.svelte` | Volume rows read `DISPLAY_GROUPS` (Task 2) |

**Modified — tests:**

`src/lib/training/volume.test.ts`, `src/lib/training/generate.test.ts`.

---

## Task 1: One exercise credits a group once

**The bug:** `weeklySetsByGroup` credits a group once per *muscle*, not once per *exercise*. `GROUP` maps `lats`, `middle back`, `lower back` and `traps` all onto `back`, so a 3-set Barbell Deadlift — primary `lower back`, secondary `lats`/`middle back`/`traps` — books 3 + 1.5 + 1.5 + 1.5 = **7.5 back sets**. Every row books 1.5×. Every curl books 1.5× because `forearms` maps onto `biceps`. 75 of the 363 generator-eligible exercises are affected. Measured effect: back reads 23.5 where the truth is 16 (3d targeted), 46.5 where the truth is 30 (6d full body).

**The rule:** a group gets full credit if *any* primary muscle maps to it, half credit if only secondaries do, and nothing twice.

**Files:**
- Modify: `src/lib/training/volume.ts:55-95` (`weeklySetsByGroup`, `actualSetsByGroup`)
- Test: `src/lib/training/volume.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/training/volume.test.ts`:

```ts
test('one exercise credits a group once, however many of its muscles land there', () => {
	// Barbell Deadlift's real tagging: lower back primary, with lats, middle
	// back and traps secondary. All four collapse to `back`, and the old
	// scoring paid for each one — 7.5 sets of "back" from three sets of
	// deadlifts, which is why back always read as covered.
	const vol = actualSetsByGroup([
		trained({
			primary_muscles: ['lower back'],
			secondary_muscles: ['lats', 'middle back', 'traps', 'hamstrings'],
			movement_pattern: 'hip_hinge',
			sets: 3
		})
	]);
	assert.equal(vol.back, 3);
	assert.equal(vol.hamstrings, 1.5);
});

test('a primary hit is not topped up by a secondary in the same group', () => {
	// Every curl in the catalog is biceps-primary with forearms secondary, and
	// forearms map to biceps. Full credit already covers it.
	const vol = actualSetsByGroup([
		trained({
			primary_muscles: ['biceps'],
			secondary_muscles: ['forearms'],
			movement_pattern: 'biceps_curl',
			sets: 4
		})
	]);
	assert.equal(vol.biceps, 4);
});

test('two secondaries in one group still pay only once', () => {
	const vol = actualSetsByGroup([
		trained({
			primary_muscles: ['chest'],
			secondary_muscles: ['lats', 'traps'],
			sets: 4
		})
	]);
	assert.equal(vol.back, 2);
});
```

And in `src/lib/training/generate.test.ts`, guarding the plan side of the same rule:

```ts
test('the plan and the log score an exercise identically', () => {
	// weeklySetsByGroup and actualSetsByGroup must never drift: the stats page
	// shows them side by side and calls the difference under-training.
	const draft = generate({ daysPerWeek: 4, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', catalog: catalog() });
	const planned = weeklySetsByGroup(draft);
	const logged = actualSetsByGroup(
		draft.sessions.flatMap((s) =>
			s.exercises.map((pe) => ({
				primary_muscles: pe.exercise.primary_muscles,
				secondary_muscles: pe.exercise.secondary_muscles,
				movement_pattern: pe.exercise.movement_pattern,
				sets: pe.target_sets
			}))
		)
	);
	assert.deepEqual(planned, logged);
});
```

Add `actualSetsByGroup` to the `./volume.ts` import in `generate.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Volumes/home/docker/plateload && npm run test:training 2>&1 | grep -E "^(ℹ (tests|pass|fail)|not ok)"
```

Expected: FAIL — `vol.back` is 7.5, not 3; `vol.biceps` is 6, not 4.

- [ ] **Step 3: Extract the shared scoring rule**

In `src/lib/training/volume.ts`, add above `weeklySetsByGroup`:

```ts
/**
 * One exercise's credit, applied once per group. A group is worth a full set
 * if any primary muscle lands there and half a set if only secondaries do —
 * never both, and never once per muscle. Four of the dataset's muscles
 * collapse onto `back`, so paying per muscle made a deadlift worth 2.5×.
 */
function creditExercise(
	out: Record<string, number>,
	primary: string[],
	secondary: string[],
	sets: number
): void {
	const primaryGroups = new Set<string>();
	for (const m of primary) {
		const g = muscleGroup(m);
		if (g) primaryGroups.add(g);
	}
	for (const g of primaryGroups) out[g] = (out[g] ?? 0) + sets;

	const secondaryGroups = new Set<string>();
	for (const m of secondary) {
		const g = muscleGroup(m);
		if (g && !primaryGroups.has(g)) secondaryGroups.add(g);
	}
	for (const g of secondaryGroups) out[g] = (out[g] ?? 0) + sets * 0.5;
}
```

Rewrite both scorers to use it:

```ts
export function weeklySetsByGroup(draft: RoutineDraft): Record<string, number> {
	const out: Record<string, number> = {};
	for (const session of draft.sessions) {
		for (const { exercise, target_sets } of session.exercises) {
			// Cardio and unpatterned oddities never count toward volume.
			if (!exercise.movement_pattern) continue;
			creditExercise(out, exercise.primary_muscles, exercise.secondary_muscles, target_sets);
		}
	}
	for (const g of Object.keys(out)) out[g] = Math.round(out[g] * 2) / 2;
	return out;
}
```

```ts
export function actualSetsByGroup(trained: TrainedExercise[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const t of trained) {
		if (!t.movement_pattern) continue;
		creditExercise(out, t.primary_muscles, t.secondary_muscles, t.sets);
	}
	for (const g of Object.keys(out)) out[g] = Math.round(out[g] * 2) / 2;
	return out;
}
```

- [ ] **Step 4: Run the training suite**

```bash
cd /Volumes/home/docker/plateload && npm run test:training 2>&1 | grep -E "^(ℹ (tests|pass|fail)|not ok)"
```

Expected: PASS. Some pre-existing volume assertions in `generate.test.ts` may now fail *legitimately* — back and biceps drop. Do not loosen an assertion to make it pass without confirming the new number is the true one; the point of the task is that the old number was a lie.

- [ ] **Step 5: Run the whole suite**

```bash
cd /Volumes/home/docker/plateload && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

Expected: 0 failures across all three suites.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/home/docker/plateload
git add src/lib/training/volume.ts src/lib/training/volume.test.ts src/lib/training/generate.test.ts
git commit -m "fix(volume): an exercise credits a muscle group once, not once per muscle"
```

---

## Task 2: `back` means lats and mid-back, not everything behind you

**The bug:** with Task 1 in, a deadlift still books 3 full `back` sets on its `lower back` primary, and a shrug books 3 on `traps`. So a routine whose only lat work is one set of pullups can still report `back: 16` and satisfy every target. This is the accounting half of the "2:1 chest-to-back" finding — the lifter's actual pulling work was 6 sets.

**The rule:** `back` is the group the coverage contract cares about, and it means `lats` + `middle back`. `traps` and `lower back` become their own groups: still scored, still filterable, still displayed — but no longer standing in for pulling volume, and not in `MAJOR_GROUPS`, because neither needs a dedicated slot to be trained enough.

**Files:**
- Modify: `src/lib/training/volume.ts:8-24` (`GROUP`), `:37-48` (`MAJOR_GROUPS`, new `DISPLAY_GROUPS`)
- Modify: `src/lib/training/filters.ts:38-49` (`GROUP_FORCE`)
- Modify: `src/lib/components/ExercisePicker.svelte:9,143`
- Modify: `src/routes/you/stats/+page.svelte:4,48`
- Test: `src/lib/training/volume.test.ts`, `src/lib/training/generate.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/training/volume.test.ts`:

```ts
test('traps and lower back are their own groups, not pulling volume', () => {
	// A shrug is not a row and a deadlift is not a pulldown. Folding all four
	// dataset muscles into `back` let a routine with one set of lat work
	// report a covered back.
	const vol = actualSetsByGroup([
		trained({ primary_muscles: ['traps'], movement_pattern: 'shrug', sets: 3 }),
		trained({ primary_muscles: ['lower back'], movement_pattern: 'hip_hinge', sets: 3 }),
		trained({ primary_muscles: ['lats'], movement_pattern: 'vertical_pull', sets: 3 })
	]);
	assert.equal(vol.back, 3);
	assert.equal(vol.traps, 3);
	assert.equal(vol['lower back'], 3);
});

test('the coverage contract does not demand a slot for traps or lower back', () => {
	// Both get plenty from rows, hinges and carries. Naming them in
	// MAJOR_GROUPS would make the generator warn about a gap that is not one.
	assert.ok(!MAJOR_GROUPS.includes('traps' as never));
	assert.ok(!MAJOR_GROUPS.includes('lower back' as never));
	assert.ok(DISPLAY_GROUPS.includes('traps'));
	assert.ok(DISPLAY_GROUPS.includes('lower back'));
});
```

Import `MAJOR_GROUPS` and `DISPLAY_GROUPS` in `volume.test.ts`.

In `src/lib/training/generate.test.ts`, the assertion the whole task exists for:

```ts
test('every generated routine has real pulling work, not just hinges and shrugs', () => {
	// The regression: back read as covered because deadlifts and shrugs paid
	// into it. Vertical and horizontal pulls are the only things that count.
	for (const days of [3, 4, 5, 6] as const) {
		for (const splitStyle of ['full_body', 'targeted'] as const) {
			const draft = generate({ daysPerWeek: days, equipment: ALL_EQUIPMENT, profileKey: 'hypertrophy', splitStyle, catalog: catalog() });
			const back = weeklySetsByGroup(draft).back ?? 0;
			assert.ok(back >= 6, `${days}-day ${splitStyle} gives back only ${back} sets`);
		}
	}
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Volumes/home/docker/plateload && npm run test:training 2>&1 | grep -E "^(ℹ (tests|pass|fail)|not ok)"
```

Expected: FAIL — `DISPLAY_GROUPS` is not exported; `vol.traps` is undefined.

- [ ] **Step 3: Split the groups**

In `src/lib/training/volume.ts`, change three entries in `GROUP`:

```ts
	'lower back': 'lower back',
	traps: 'traps',
```

and leave `neck: 'back'` — the dataset's two neck exercises are unpatterned and never scored.

Then, below `MAJOR_GROUPS`:

```ts
/**
 * Every group worth showing in a volume table or offering as a filter.
 * MAJOR_GROUPS is the narrower list: the groups a routine must train
 * *directly*, which is why traps and lower back are absent from it — both are
 * fed generously by rows, hinges and carries without a slot of their own.
 */
export const DISPLAY_GROUPS = [...MAJOR_GROUPS, 'traps', 'lower back'] as const;
```

- [ ] **Step 4: Keep the derived force classification unchanged**

In `src/lib/training/filters.ts`, `GROUP_FORCE` gains two entries so unpatterned traps and lower-back work classifies exactly as it did when both were `back`:

```ts
	traps: 'pull',
	'lower back': 'pull',
```

- [ ] **Step 5: Keep both groups visible in the UI**

`src/lib/components/ExercisePicker.svelte` — import `DISPLAY_GROUPS` instead of `MAJOR_GROUPS` at line 9 and iterate it at line 143.

`src/routes/you/stats/+page.svelte` — same swap at lines 4 and 48, so `groups` becomes `[...DISPLAY_GROUPS, 'other']`. Without this, logged shrugs land in a `traps` bucket the page never renders.

- [ ] **Step 6: Run the whole suite**

```bash
cd /Volumes/home/docker/plateload && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"
```

Expected: 0 failures. Then `npm run check` for the Svelte side.

- [ ] **Step 7: Verify against the real catalog**

Build the scratch catalog (see above) and confirm the reported numbers moved to the true ones — 3d targeted balanced should now show `back` near 10 rather than 23.5, with `traps` and `lower back` broken out.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/home/docker/plateload
git add src/lib/training/volume.ts src/lib/training/filters.ts src/lib/training/volume.test.ts \
        src/lib/training/generate.test.ts src/lib/components/ExercisePicker.svelte \
        src/routes/you/stats/+page.svelte
git commit -m "fix(volume): traps and lower back stop standing in for pulling volume"
```

---

## Task 3: Emphasis may not put a curl on push day

**The bug:** `applyEmphasis` at `generate.ts:205` accepts any extra whose `slotRegion` is the emphasized one — and `slotRegion` only knows `lower` / `upper` / `core`. Push day trains "upper", so it accepts `biceps_curl`; pull day trains "upper", so it accepts `lateral_raise` — duplicating the push day slot next to a face pull that already covers rear delts. Confirmed at 3d, 5d and 6d targeted with `upper` emphasis.

**The rule:** a targeted session declares its force, and only extras matching that force may join it. `filters.ts` already holds the mapping (`PATTERN_FORCE`); the generator has simply never asked.

**Files:** `src/lib/training/generate.ts` (`Template` gains an optional `force`; `TARGETED` entries declare it; `applyEmphasis` filters candidates through it), `src/lib/training/filters.ts` (export `patternForce`).

**Test:** for every day count and both emphases, no exercise in a session named Push/Pull/Legs has a `forceCategory` other than that session's own or `core`. Full-body sessions are exempt — they train everything by construction.

**Detail this task fully once Task 2 has landed**, so its assertions are written against true numbers.

---

## Task 4: De-emphasis may not delete a muscle's last direct slot

**The bug:** the cut at `generate.ts:186` picks the isolation whose group has the most direct slots elsewhere in the week, counted through the static `PATTERN_GROUP` map. That map claims `hip_hinge: 'hamstrings'` (`generate.ts:158`), but the real catalog's top-priority hinge is Barbell Deadlift — `lower back`-primary. So the cut removes the leg curl believing hamstrings still have the hinge. They do not. Hamstrings lose all direct work at 2d/3d/4d/6d targeted-upper and 2d/3d full-body-upper.

**The rule:** never cut below one direct slot per group, and count coverage against the exercises actually picked rather than a static map — which means the cut moves after slot filling, or `PATTERN_GROUP` stops being the authority.

**Test:** the existing `every major muscle group gets direct work from 3 days up` test at `generate.test.ts:127` extended to loop over all three emphases. It currently only ever runs `balanced`, which is why this shipped. The fixture's `hip_hinge` entries must be re-tagged `lower back`-primary to match the real catalog first.

---

## Task 5: A session with a squat gets a hamstring hinge

**The bug:** `LEGS_A` pairs `squat` with `hip_hinge`, and `hip_hinge` resolves to Barbell Deadlift (priority 100) over Romanian Deadlift (priority 96). Leg day therefore ends with no hamstring-primary movement even before Task 4's cut, and with two maximal axial loads in one session.

**The rule:** when a session already holds a squat-pattern compound, the hinge slot prefers a candidate whose primary muscle is hamstrings. This is a slot-level preference, not a priority change — conventional deadlifts stay the top pick where they are the session's only heavy compound.

**Test:** every generated leg or full-body session containing a squat pattern also contains a hamstrings-primary exercise.

---

## Task 6: Extra sets spread out instead of piling up

**The bug:** the top-up loop at `generate.ts:308` uses `.find()`, which restarts at index 0 every iteration — so it drives the *first* eligible exercise to the cap of 5 before touching the second. That is the entire origin of "5 sets of bench, 5 of incline, 5 of pushdowns, 5 of hanging leg raises". Nobody chose those numbers.

**The rule:** add the set to the eligible exercise with the fewest sets, and cap compounds and isolations separately — a fifth set of hanging leg raises and a fifth set of bench are different propositions.

**Test:** within one session, the spread between eligible exercises' set counts never exceeds one; no compound exceeds its own cap.

---

## Task 7: Ceilings, and saying so when a group is short

**The bug:** `weekly_sets_max` exists on every profile and is used only to compute a midpoint (`generate.ts:294`). Nothing enforces it. Measured: 6d full body books back 46.5, shoulders 33, hamstrings 27 against a stated 10–20 target; 3d targeted-lower produces a 33-set leg day. The reverse is silent — 3d targeted leaves quads at 6.5 and abs at 5 with no warning, because the warning at `generate.ts:324` only fires on *zero* direct work.

**The rule:** three ceilings and one confession — stop adding at `weekly_sets_max`; cap direct sets per group per session; cap total sets per session; and warn when a group finishes under `weekly_sets_min` even though it had direct work.

**Test:** no group exceeds `weekly_sets_max` and no session exceeds the session budget, for every day count × style × emphasis; any group under the minimum appears in `warnings`.

---

## Task 8: Warnings survive the save

**The bug:** `routineToDraft` at `src/lib/server/routines.ts:216` hardcodes `warnings: []`, so everything the generator confessed at generate time is gone the moment the routine is saved. The routine detail page's volume table flags "low" but has no concept of "high".

**The rule:** recompute warnings from the saved routine when the detail page loads, and flag both ends of the range.

**Files:** `src/lib/server/routines.ts`, `src/routes/routines/[id]/+page.svelte:220-240`.
