# Chains (slice 5)

**Status:** implemented 2026-11-12 on `feat/chains`. One change from the
design: the new rungs sit at priority 0 and the generator skips patterned rows
at 0, because the rotation picks any unused candidate for variety, however low
it ranks (a box pistol showed up in 108 of 540 harness combinations at
priority 5). With that, generator output is identical before and after for
all six harness gyms, and old seed + 0006 reproduces the new seed row for row.

Originally: design, 2026-11-12. Slice 5 of
`2026-11-09-running-and-bodyweight-direction.md` §3 and §6. Builds on slice 4
(`requires_bar`, the `pull-up bar` key, migration 0005), so this slice's
migration is 0006.

## Goal

On a barbell, harder is five pounds. On the floor, harder is the next
exercise. A bodyweight exercise that has been beaten two sessions running
offers **Move up: Archer Push-Up**; one that has beaten you two sessions
running offers **Move down**. One tap, one confirm, and the routine carries
the new rung from then on. Nothing else in the app changes: the generator
picks exactly what it picks today.

## Chains

`src/lib/training/chains.ts`, pure, modelled on `mobility.ts`. Hand-curated
linear chains. Each rung is a catalog id, its display name, whether it needs
the bar, and a graduation target: the reps (or seconds) every working set must
reach to move off it. The top rung has no target; it progresses the way it
does today (more reps, or added load on pull-ups and dips).

| Chain | Rungs (graduation) |
|---|---|
| Push | Incline Push-Up (15) → Push-Up (15) → Feet-Elevated Push-Up (12) → Archer Push-Up* (8) → Single-Arm Push-Up |
| Pull | Negative Pull-Up* (5) → Chin-Up (10) → Pull-Up |
| Row | Inverted Row (12) → Feet-Elevated Inverted Row* (12) → Archer Inverted Row* |
| Squat | Bodyweight Squat (25) → Bulgarian Split Squat (15) → Box Pistol Squat* (8) → Pistol Squat* |
| Hamstring | Nordic Negative* (6) → Nordic Curl (`Natural_Glute_Ham_Raise`) |
| Dip | Bench Dip (15) → Dip |
| Leg raise | Hanging Knee Raise* (15) → Hanging Leg Raise (12) → Toes-to-Bar* |
| L-sit | Tuck L-Sit* (20 s) → L-Sit* |
| Handstand | Pike Push-Up (12) → Elevated Pike Push-Up* (10) → Handstand Push-Up |

\* new synthetic row, 12 in all, each with cues and a movement pattern so it
earns volume. Priority 0, which the generator skips: a chain is how you reach
them.

Invariants, enforced by test: every id resolves in the seed with the same name
and `requires_bar`; an exercise belongs to at most one chain; every rung in a
chain shares a progression kind (reps or time); targets are positive and
every rung but the top has one.

## Deciding (`suggestChain`)

Wraps `suggest()`. Given the exercise, its history, prescription and whether
the gym has the bar:

- **Move up** when the last two sessions each logged at least `target_sets`
  working sets and every working set reached the graduation target, at no
  assistance (net load ≥ 0). Two sessions, because a rung is a bigger jump
  than a plate. **Held** if the next rung needs a bar the gym lacks.
- **Move down** when the first working set fell under `rep_min` (time: under
  10 s) two sessions running at bodyweight (net load exactly 0). Assisted or
  weighted work keeps the existing deload, which handles net load already.
- Otherwise `suggest()` as today. A fresh rung's start note says how many reps
  to find rather than "find a weight".

It returns the step separately from the ordinary suggestion, so the inputs
still prefill from `suggest()` when the step is declined.

## Logger

- Chained exercises show their place, `PUSH · 3/5`, beside the last line.
- An offered step shows above the inputs: **Move up: Archer Push-Up**, with a
  one-line reason. Tap once, it turns into **Confirm: routine updates too**
  (or **today only** on a freestyle session); tap again to swap. Hidden once
  sets are logged, or if the rung is already in today's list.
- The swap is `swapExercise`: the new rung inherits sets and reps.
- The routine change rides the outbox as `rung_changes: [{ from, to }]` on the
  workout entry, so it works in a dead zone and lands with the workout. The
  sync endpoint applies each change to `routine_exercise` rows of that
  workout's routine day, owned by the user, only when `from → to` are
  neighbours in a chain. Replaying the entry is a no-op: `from` is gone.

The session snapshot gains `gym.equipment` so the bar check works offline.
Sessions stored before it treat the bar as present.

## Not in this slice

Dead hang, wall handstand hold and other statics without a chain. A chain
builder. Moving more than one rung. Chain display on the routine editor.
Calisthenics generator template (slice 7).

## Tests

- `chains.test.ts`: invariants above, against the seeded catalog.
- `suggestChain`: up after two clean sessions, not after one; held without a
  bar; not while assisted; down after two short first sets at bodyweight;
  falls through at the top rung; time rungs.
- Seed and 0006: the twelve rows exist with patterns, cues and `requires_bar`;
  0006 matches the seed; generator output identical to before for all six
  harness gyms across 90 combinations (scratch harness).
- Sync: a rung change updates the routine row; non-neighbours and other users'
  routines are ignored; replay is a no-op.
