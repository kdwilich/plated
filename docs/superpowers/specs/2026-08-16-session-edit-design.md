# Editing today's session

**Status:** approved, not yet implemented
**Date:** 2026-08-16

## Problem

The routine is editable: `/routines` lets you change a prescription, swap an
exercise, or remove one, and it writes to D1. Today's session is not. Once
`/workout` is running, the list is fixed — you can add to it and you can log
against it, but you cannot take something off or put something else in its
place.

That is exactly backwards from how a gym works. The rack is taken, the cable
station has a queue, your shoulder is complaining. You need to change *today*
without touching the program.

This adds an edit mode to `/workout`: swap or remove an exercise in the active
session, local to that session, invisible to the routine.

## Non-goals

- Changing the prescription (sets, rep range) mid-session. `/routines` owns that.
- Writing anything back to the routine. Today only.
- Reordering. "Machine's taken, I'll come back to it" is real, but drag on touch
  is a large lift and swap covers most of it. Revisit if it bites.
- Editing a *finished* session. `/history` is read-only and stays that way.

## The mode

A toggle in the session header, not in the bottom button cluster:

```
Push A                          12:34   Edit
```

Placement is the one deliberate departure from the obvious design. Entering edit
mode collapses every open card, which can halve the page height. A toggle
anchored below `+ Add exercise` would jump out from under the finger that
pressed it and land offscreen when it is time to exit. The header does not move.

Tapping `Edit`:

- sets `openId = null`, collapsing every expanded exercise
- turns the button into `Done`
- replaces each row's ⓘ guide link with `⇄` (swap) and `✕` (remove)
- shows one line under the header: **Today only — your routine is unchanged.**

The header button is hidden when the session holds no exercises — a freestyle
session starts empty and has nothing to edit.

While the mode is on, the exercise head is inert: tapping a row must not expand
it into the logger. Leaving the mode leaves everything collapsed; you then open
whatever you are about to lift.

## The zero-sets rule

**Swap and remove are offered only for exercises with no logged sets.**

This is the decision the whole feature turns on. If a logged exercise could be
removed, one of two things has to happen, and both are wrong: the sets die
silently, destroying work you actually did, or they survive into `workout_set`
and history shows sets for an exercise the session no longer lists.

There is no use case on the other side. Once a set is logged the work happened;
`2/4` is an accurate record and the right move is to move on. The only reason to
remove something is *I am not doing this*, which means zero sets.

So, in edit mode, per row:

| State | Row shows |
|---|---|
| No sets at all | `⇄` and `✕`, both act immediately |
| Any set logged (warm-up included) | faint `logged` beside the existing `2/4` |

The gate is *any* set, warm-up included — tapping a warm-up chip is work done at
that station. No confirmation dialogs, no data loss, no orphan question. To
clear an exercise that has sets, delete them with the existing per-set `×`
first; the icons come back on their own.

## Remove

Drops the exercise from `session.exercises` and persists. Because the row can
only be removed at zero sets, `session.sets` needs no cleanup — there is nothing
to clean. The primed input state (`weightInput`, `repsInput`, `durationInput`)
is keyed by `exercise_id` and is dropped too, so re-adding the same exercise
later starts from a fresh suggestion rather than a stale number.

## Swap

Opens `ExercisePicker` inline beneath the row with `recommendFor` set to the
exercise being replaced — the same alternatives list `/routines` already uses,
now with guide links on every row. Picking:

1. fetches `/api/exercise-context?id=…` for the replacement
2. **inherits the prescription** — `target_sets`, `rep_min`, `rep_max` — from the
   exercise being replaced
3. writes it into `session.exercises` at the *same index*, so the day keeps its
   shape
4. drops the old exercise's primed inputs
5. persists and closes the picker

Step 2 matters. `/api/exercise-context` hardcodes `3 × 8–12`, which is right for
an exercise added out of nowhere and wrong for one standing in for a prescribed
4 × 5. The merge is client-side; the endpoint does not change.

A replacement already in the session is refused silently, matching what
`addExercise` does today.

The picker stays open across a failed fetch, so a dead zone loses nothing but
the tap.

## What this does not touch

- **The routine.** No form action, no D1 write. `routine_session_id` on the
  session record is untouched, so the finished workout still reports which
  routine day it came from — it just no longer has to match it exercise for
  exercise, which was already true the moment `+ Add exercise` shipped.
- **The warm-up.** `drills` derives from `session.exercises`, so removing the
  only pressing movement re-derives the mobility list for free.
- **Sync.** `toPayload` builds from `workout` and `sets`; the exercise list is
  client-side scaffolding and never crosses the wire.

## Tests

No new unit tests. This adds no pure logic — the training core is untouched, and
the change is entirely session-state mutation plus rendering. The existing 85
must still pass, `svelte-check` must stay clean, and the behaviour is verified
against a real local D1 session in the browser:

- Edit collapses an open card and hides the logger
- A zero-set exercise swaps in place, keeping its position and prescription
- A zero-set exercise removes and the warm-up list re-derives
- An exercise with a logged set offers neither icon
- Deleting its last set restores both icons
- Reload proves both mutations reached IndexedDB
- Finishing afterward syncs the logged sets and nothing else
