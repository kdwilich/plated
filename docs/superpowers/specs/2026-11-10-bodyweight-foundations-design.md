# Bodyweight foundations (slice 4)

**Status:** implemented 2026-11-10 on `feat/bodyweight-foundations`. Two
changes from the design, both found by the real-catalog comparison: the plain
`Butt Lift (Bridge)` keeps its Glute Bridge alias but no pattern (as a second
hip thrust it displaced the barbell hip thrust's repeat on a full gym's sixth
day), and the glute-ham rule is body-only so the machine version stays out of
full-gym leg curl slots. With those, full gym (with the bar the migration adds)
and barbell + dumbbell output are identical to before in all 90 combinations,
and old seed + 0005 reproduces the new seed row for row.

Known and left: a chin-up standing in for a curl gets the curl's 10–15 reps,
which is high; a floor gym's targeted Pull day is empty, named and unsaveable,
because nothing on the floor pulls.

Originally: design, 2026-11-10. Slice 4 of
`2026-11-09-running-and-bodyweight-direction.md` §3 and §6. Builds on the split
review merged as `c404581` (migration 0004 is the pattern fixes, so this
slice's migration is 0005, not the 0004 the direction doc named).

## Goal

A floor gym and a pull-up-bar gym generate a real week: no pull-ups without a
bar, a squat, a row, a hamstring curl and a calf raise where the body can do
one, no exercise twice in a session, no empty day. Full-gym and barbell +
dumbbell output does not change.

## Where it stands (real catalog, `body only` gym, hypertrophy, balanced)

- Pull-ups, chin-ups, hanging leg raises and dips are picked with no bar.
- No squat (the seed excludes `Bodyweight Squat` on purpose), no leg curl, no
  calf raise, no row, no biceps curl. Quads finish on 2–3 indirect sets,
  calves on 0.
- 4-day targeted Upper B is empty; Lower B lists Step-up with Knee Raise twice.
- `Inverted Row`, `Bodyweight Walking Lunge`, `Decline Push-Up` and `Floor
  Glute-Ham Raise` have no equipment in the dataset, so the seed never gives
  them a pattern.
- Band exercises are never patterned (`bands` is not an eligible equipment and
  `with bands` is in the exclusion list), so ticking bands changes nothing.

## Design

### Catalog (seed + migration 0005)

1. **`requires_bar INTEGER NOT NULL DEFAULT 0`** on `exercise`. The seed sets
   it by name for body-only work: pull-ups, chin-ups, hanging raises and pikes,
   parallel-bar dips, inverted rows. Bench dips stay floor work. `equipment`
   keeps meaning what it means: `allowsNegativeLoad` and `incrementFor` key
   off `'body only'` and are untouched.
2. **No-equipment strength rows become `body only`.** The dataset's null
   equipment on a strength row means "no kit". `Prone Manual Hamstring` (needs
   a partner) and `Scapular Pull-Up` (a drill, not a vertical pull) get
   excluded from patterns, and so does `Standing Towel Triceps Extension`
   (partner).
3. **Pattern rules:**
   - `Bodyweight Squat` is a squat. Jump squats stay unpatterned.
   - `Decline Push-Up` (feet up) is the bodyweight incline press.
   - `Pike Push-Up` is a vertical press, ahead of handstand push-ups.
   - Glute-ham raises (natural and floor) are leg curls, aliased Nordic curl.
   - `Butt Lift (Bridge)` gets the Glute Bridge alias (no slot; see status).
   - Band exercises are eligible. The `with bands` exclusion only applies when
     the band is an add-on to a barbell, not when bands are the equipment.
     `Band Pull Apart` is rear-delt work.
4. **Synthetic staples** (stable ids, upserted like `run`):
   - `bw-bulgarian-split-squat`: Bulgarian Split Squat (Bodyweight), lunge.
   - `bw-single-leg-rdl`: Single-Leg Romanian Deadlift (Bodyweight), hinge.
   - `bw-single-leg-calf-raise`: Single-Leg Calf Raise, calf raise.
   - `bw-pike-push-up`: Pike Push-Up, vertical press.

   Each has cues. Priorities sit below every barbell, dumbbell, machine and
   cable classic, so gyms that have them never see these first.
5. **Migration 0005** carries all of it to the live database: the column, the
   `UPDATE`s for every refiled row (equipment, pattern, priority,
   requires_bar), the synthetic `INSERT OR IGNORE`s with aliases and FTS rows,
   and `pull-up bar` added to every gym that holds `body only`. Your gym has
   pull-ups today; a column that took them away on deploy would be a
   regression. You can untick the bar afterwards.

### Generator

- An exercise with `requires_bar` is a candidate only when the gym holds
  `pull-up bar`. Same rule in `alternatives.ts` availability.
- `FALLBACK` gains `biceps_curl → vertical_pull` (chin-ups are the bodyweight
  curl) and `chest_fly → horizontal_press` (a push-up variant at accessory
  dose). Both fire only when the original pattern has no candidate at all, so
  any gym with dumbbells is unchanged.
- A non-optional slot whose candidates are all used falls back to a repeat
  only from **outside this session**. Never the same exercise twice in one day.

### Gym page

- New key **`pull-up bar`**, shown as "pull-up / dip bar".
- Presets above the checkboxes: **Floor only** (`body only`), **Pull-up bar**
  (`body only`, `pull-up bar`), **Full gym** (the bootstrap list plus the bar).
  A preset sets the boxes and nothing else; you can still edit them and save.
- Plates are required only when the gym has a barbell or an EZ bar. A floor
  gym saves with an empty plates field.
- `bootstrapUser` gives new gyms the bar.

## Not in this slice

Chains, Move up / Move down, dead hangs, L-sits, archer and knee push-ups
(slice 5). Ring-specific equipment. A calisthenics profile. Anything that
changes how full-gym splits come out.

## Tests

- Seed: every `requires_bar` row is body-only and named like bar work; no
  floor exercise carries it; the four staples exist with patterns; jump squats
  and partner exercises have no pattern; band rows are patterned.
- Migration 0005: each row it updates matches `seed.sql` (pattern, priority,
  equipment, requires_bar), and it adds the bar to body-only gyms (testdb).
- Generator, fixture catalog: no `requires_bar` pick without the bar;
  biceps and fly fallbacks; no repeat inside a session.
- Real catalog (scratch harness, not committed): floor and bar gyms across all
  90 combinations have no empty session, no repeat in a session, no bar work
  without a bar. Full gym and barbell + dumbbell output is identical before
  and after.
- Gym action: a floor gym saves with no plates; a barbell gym still needs
  them.
