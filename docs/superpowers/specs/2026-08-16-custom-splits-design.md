# Custom splits

**Status:** approved, not yet implemented
**Date:** 2026-08-16

## Problem

A routine can only come into existence one way: `/routines/generate` picks 2–6
days, a style, an emphasis and a profile, and the generator fills fixed
templates. You get `Push`, `Pull`, `Legs A`, `Full body B`. After that,
`/routines` lets you edit the exercises inside a day and nothing else — you
cannot rename the routine, rename a day, add a day, or remove one.

So there is no way to build the split you actually want, and no way to call a
day what you actually call it.

This adds a hand-built path: name a routine, add days with whatever names you
like, pick every exercise yourself. And because hand-building a five-day split
is a long sitting, it stops routines from being singular — a half-finished
routine must never be the live one.

## Non-goals

- Changing how the generator works. Its templates, emphasis logic, and volume
  pass are untouched.
- Sharing, importing, or exporting routines.
- Reordering exercises within a day. Days reorder; exercises do not. Same
  reasoning as the session-edit spec: drag on touch is a large lift, and
  remove-then-add covers it.
- Per-routine gym selection. A routine still binds to the one gym.
- Scheduling. There is still no calendar; `position` is a rotation order.

## No migration

`routine` already has `id, name, profile_key, gym_id, is_active, created_at`.
`routine_session` already has `position` and a free-text `name`.
`routine_exercise.session_id` already cascades on session delete. The schema has
supported a library since it was written; only `getActiveRoutine()` and a
single-page assumption stood in the way. Nothing in `d1/` changes.

This matters beyond tidiness: `d1/seed.sql` is not currently re-runnable, so a
migration would have been the expensive part of this feature.

## The library

`/routines` stops being the editor and becomes the list.

```
Routines

┌──────────────────────────────────┐
│ 4-day split              ACTIVE  │
│ 4 days · 22 exercises            │
├──────────────────────────────────┤
│ My PPL                           │
│ 3 days · 18 exercises      [Use] │
└──────────────────────────────────┘

[ Generate a split ]
[ Build from scratch ]
```

Tapping a card opens `/routines/[id]`. `Use` runs `?/activate`.

Destructive and duplicative actions are deliberately *not* on the cards. Delete
and Duplicate live inside the editor, where you can see what you are about to
act on. A list of near-identical rows is the worst possible place for a delete
button.

The nav tab still points at `/routines`, and `isActive()` already matches by
prefix, so `/routines/[id]` keeps the tab lit.

## The editor

`/routines/[id]` is today's `/routines` moved wholesale. Per-exercise edit,
swap, remove and add are unchanged, including the `ExercisePicker` wiring.

What is new:

**Names are live inputs.** The routine title and each day heading are `<input>`s
styled as the heading they replace — no edit mode, no pencil affordance. Blur or
Enter submits `?/rename` / `?/rename-session`. A name is not worth a confirm
step, and an accidental save costs nothing.

**Day controls** sit in the day header: `⌃ ⌄ ✕` — move up, move down, delete.
`?/move-session` swaps `position` with the neighbour; `?/remove-session` deletes
the row and lets the FK cascade take the exercises.

**`+ Add day`** at the bottom of the list creates a `routine_session` named
`New day` at `MAX(position) + 1`.

**Bottom actions:** `Make this my routine` (hidden when already active),
`Duplicate`, `Delete routine`.

`Duplicate` exists because it is what makes "custom" affordable. Hydrate the
routine, adapt it to a `RoutineDraft`, hand it to the existing
`saveRoutineFromDraft`. It turns building a custom split from *type in thirty
exercises* into *copy the generated PPL, rename the days, swap four things*.

## Building from scratch

`Build from scratch` → `?/create` → a routine named `New routine` with the
active routine's `profile_key` (or `hypertrophy` if there is none), zero days,
**`is_active = 0`** — then redirect into the editor.

Inactive is the whole point of the library. Nothing you are still assembling is
ever what `/` offers you to train.

## Prescriptions when adding by hand

`?/add` currently hardcodes `target_sets: 3, rep_min: 8, rep_max: 12,
rir_target: 2` for every exercise regardless of profile or exercise. That is
survivable when you are tweaking a generated routine and untenable when the
whole routine is hand-added — every exercise would come out identical, and the
`profile_key` on the routine would be a decorative label.

New pure function in `src/lib/training/profiles.ts`:

```ts
export function prescriptionFor(
	profile: Profile,
	mechanic: string | null | undefined
): { target_sets: number; rep_min: number; rep_max: number; rir_target: number };
```

`'compound'` takes `profile.compound`, everything else takes
`profile.isolation`. Null `mechanic` falls to isolation deliberately: an
exercise the dataset declined to classify is likelier a curl than a squat, and
the failure mode is a lighter prescription rather than a heavier one.

This is inference the generator does not do — it reads `kind` off its own
template slots. `mechanic` is the catalog's own word for the same distinction,
and it is the only signal available when a human picks the exercise.

## Volume feedback

The `Weekly sets per muscle` table exists only on the generate preview, where
a machine already balanced the volume. A hand-built routine needs it more:
nothing is checking your work.

The same card renders on the editor, under the day list, with groups below the
profile minimum in `$signal`. Computed in `load` from the hydrated routine.

`weeklySetsByGroup()` takes a `RoutineDraft`, and `RoutineExerciseRow` is
already `PrescribedExercise` shape apart from nullable `rep_min`, `rep_max` and
`rir_target`. One adapter in `$lib/server/routines.ts` serves both this and
`Duplicate`:

```ts
export function routineToDraft(routine: RoutineRow): RoutineDraft;
```

Nulls coalesce to the profile's own numbers rather than to zero, so a row that
predates a prescription does not read as free volume.

## Guards

- **Activating an empty routine fails** with a stated reason. A routine with no
  exercises makes `/` a dead end — session cards with nothing in them.
- **Deleting the active routine promotes the most recently created survivor.**
  Otherwise a delete silently leaves you with no active routine and a home page
  that says "No routine yet" while four routines sit in the library. Deleting
  the last one correctly does land there.
- Generating still auto-activates and now redirects to `/routines/[id]` rather
  than `/routines`, so you land in the editor holding the thing you just made.

## What this does not touch

- **The generator.** `src/lib/training/generate.ts` is unchanged.
- **Home.** `/+page.server.ts` still calls `getActiveRoutine()`.
- **The workout flow.** `/api/session-start` already selects
  `routine_session.name`, so a day called `Sunday Grinder` reaches the workout
  header, the resume card, and history with no change at all.
- **Sync and progression.** Neither reads `routine` or `profile_key`.

## Tests

`prescriptionFor` is the only new pure logic, so it is the only thing the
`node --test` glob (`src/lib/training/**/*.test.ts`) can reach.
`src/lib/training/profiles.test.ts`:

- `'compound'` returns the profile's compound block, `'isolation'` the isolation
  block, and the two differ for every shipped profile
- null and unrecognised `mechanic` return the isolation block
- every shipped profile produces `rep_min <= rep_max` and `target_sets >= 1`

Everything else is D1 and DOM, verified in the browser against real local D1:

- Build from scratch lands on an inactive routine with zero days
- Renaming the routine and a day persists across reload
- Adding days, reordering them, deleting one
- An added compound and an added isolation get different prescriptions
- The volume card moves as exercises are added and flags groups under target
- Activating an empty routine is refused with a reason
- Activating a built routine flips the badge and changes what `/` offers
- A custom day name reaches the `/workout` header
- Duplicating produces an independent copy — editing it leaves the original
- Deleting the active routine promotes another
