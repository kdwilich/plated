# Session mobility warm-up

**Status:** approved, not yet implemented
**Date:** 2026-08-16

## Problem

Plateload warms up the *bar* but not the *lifter*. `warmup.ts` ramps load toward
a working set, which is the right answer once you are already at the rack. There
is nothing telling you to get loose before that — no hip circles before a squat
day, no shoulder work before pressing.

This adds a short mobility list at the top of every session. Every session, not
just full body. Nothing extreme: a handful of drills to get loose, tailored to
what the day actually trains.

## Non-goals

- Editing drills or adding your own. Curated list only.
- A post-workout static-stretch cool-down. The catalog would support it; this is
  not that.
- Per-drill timers.
- Syncing checked state across devices.

## The module

`src/lib/training/mobility.ts`, sibling to `warmup.ts`. Pure: no DOM, no D1, no
`$lib` imports, so it runs under `node --test` like the rest of the training
core.

```ts
export interface MobilityDrill {
	/** Catalog id, so the row links to /exercises/[id]. Null for the cardio opener. */
	exercise_id: string | null;
	name: string;
	/** "10 each side", "30s", "8 slow" */
	dose: string;
	/** Why it is on today's list: "squatting today" */
	why: string;
}

export function mobility(patterns: MovementPattern[]): MobilityDrill[];
```

The input is the session's movement patterns, which the active session already
holds for every prescribed exercise. Nothing new is stored or fetched.

## The map

Drills point at ids that exist in `data/exercises.json` today; all sixteen were
verified against the catalog before this spec was written. Static stretches,
SMR/foam-rolling, and equipment-dependent entries are deliberately excluded —
they are cool-down work, not warm-up work.

### Fixed opener

One non-catalog row, always first, `exercise_id: null`:

> **5 min easy cardio** — bike, rower, or walk

It is the part of a warm-up that matters most and nothing in the catalog
represents it. It does not count against the drill cap.

### Always-on

| Drill | id | Dose |
|---|---|---|
| Cat Stretch | `Cat_Stretch` | 8 slow |
| Standing Hip Circles | `Standing_Hip_Circles` | 10 each way |

### Per-pattern

| Patterns | Region | Drills (id, dose) |
|---|---|---|
| `squat`, `lunge`, `leg_extension` | lower | Sit Squats (`Sit_Squats`, 10); Ankle Circles (`Ankle_Circles`, 10 each) |
| `hip_hinge`, `leg_curl` | lower | Inchworm (`Inchworm`, 5); Front Leg Raises (`Front_Leg_Raises`, 10 each side) |
| `hip_thrust` | lower | Kneeling Hip Flexor (`Kneeling_Hip_Flexor`, 30s each side) |
| `calf_raise` | lower | Standing Gastrocnemius Calf Stretch (`Standing_Gastrocnemius_Calf_Stretch`, 30s each) |
| `horizontal_press`, `incline_press`, `chest_fly` | upper | Dynamic Chest Stretch (`Dynamic_Chest_Stretch`, 10); Arm Circles (`Arm_Circles`, 10 each way) |
| `vertical_press`, `lateral_raise` | upper | Shoulder Circles (`Shoulder_Circles`, 10 each way); Round The World Shoulder Stretch (`Round_The_World_Shoulder_Stretch`, 5 each) |
| `horizontal_pull`, `vertical_pull`, `rear_delt`, `pullover`, `shrug` | upper | Dynamic Back Stretch (`Dynamic_Back_Stretch`, 10); Elbows Back (`Elbows_Back`, 10) |
| `biceps_curl`, `triceps_extension` | upper | Wrist Circles (`Wrist_Circles`, 10 each way) |
| `ab_flexion`, `anti_extension`, `loaded_carry` | core | Standing Pelvic Tilt (`Standing_Pelvic_Tilt`, 10) |

## Selection

1. Every pattern present in the session contributes its drills.
2. Dedupe by `exercise_id`, merging the reasons — a session that squats and
   lunges yields one Sit Squats row reading "squatting and lunging today".
3. Partition the remainder into lower and upper buckets (core drills join the
   smaller bucket).
4. **Alternate between buckets** when filling, starting with the region holding
   more compound patterns, until the cap.
5. Cap at **6 drills**, always-on included, cardio opener excluded. So: opener,
   two always-on, four pattern drills.

Step 4 is the non-obvious part. Ranking purely by region would let a
leg-heavy day crowd out every upper drill, and a full-body session is exactly
the case where both regions need representation. Alternating guarantees it.

Order within the rendered list is general → lower → upper, so you are not
getting up and down off the floor.

## Interaction and storage

`src/lib/components/WarmupCard.svelte`, rendered above the first exercise on
`/workout`.

Each row shows the drill name, its dose, and why it is there. The name links to
`/exercises/[id]`, matching what session exercises already do — which is the
whole reason for mapping into the catalog rather than writing drill copy twice.
The cardio opener has no link.

Tapping a row checks it off. Checked ids live on the local IndexedDB session
record as `mobility_done: string[]`. They are never synced to D1, never written
to history, and invisible to `volume.ts` and `progression.ts` — mobility work
must not reach the volume math or the progression engine.

Once every drill is checked the card collapses to a single "Warmed up ✓" line,
so it is out of the way for the rest of the session.

## Tests

`src/lib/training/mobility.test.ts`, under `node --test`:

- **Every `exercise_id` in the map resolves against `data/exercises.json`.** The
  one that matters — it catches typos and dataset drift.
- Full-body patterns produce at most 6 drills and cover both lower and upper.
- A pull-only session produces no leg drills beyond the always-on pair.
- No duplicate `exercise_id`s; a merged row's `why` names every pattern that
  triggered it.
- Deterministic: the same patterns produce the same list.
- The cardio opener is always present and always first.

## Open

Nothing blocking. The cardio opener is the one place a row is not catalog-backed;
if that inconsistency grates later, drop the row and the rest of the design is
unaffected.
