# Log a run

**Status:** implemented 2026-11-09 on `feat/log-a-run` (see `2026-11-09-running-and-bodyweight-direction.md` §2)
**Date:** 2026-11-09

## Problem

The user runs more than they lift now, and the app cannot record a run. The
schema can: `workout_set.distance_m` has existed since the first migration,
the outbox, the sync payload and the history editor all carry it. It dies in
exactly one place, a hardcoded `distance_m: null` in the live logger's
`logSet`, and nothing anywhere renders a distance or a pace. A run today is a
set with a duration against "Running, Treadmill".

This slice makes a run a real thing in the log: typed in after the fact in
under ten seconds, visible in history, the heatmap, the streak and the export,
with its type and effort kept. It is the smallest change that makes running
true, and it is the model every later running feature (Garmin pull, weekly
miles, standard-distance PRs) builds on.

## Non-goals

- Live tracking of any kind. No GPS, no in-run timer. The watch records; this
  is the log.
- Pulling from Garmin. That is slice 2, decided after living with this.
- Weekly mileage charts, the spike cap, standard-distance PRs, shoes. Slice 3.
- Editing a run's type or effort after the fact. The editor keeps them through
  a round trip; changing them is a follow-up once the editor grows a workout
  header. Delete and re-log covers a mis-tap for now.
- Kilometres. Miles only, the same call the You spec made about kilograms.
- Run days inside a routine. Runs are freestyle workouts.
- A `run` table. See the direction doc for why it lost.

## The model

**A run is a `workout` with one `distance_time` set.** Nothing new to sync,
export, delete or edit: those paths all key on `workout` and already carry
every column a run needs except two.

```sql
-- d1/migrations/0002_runs.sql. Additive, no CHECK: SQLite cannot alter a
-- CHECK and rebuilding `workout` means dropping the tables that reference it.
-- Validation is in TypeScript.
ALTER TABLE workout ADD COLUMN run_type TEXT;   -- NULL = not a run
ALTER TABLE workout ADD COLUMN effort INTEGER;  -- session RPE, 1–10
```

`run_type` is one of `easy`, `long`, `tempo`, `intervals`, `race`. NULL means
a strength workout, so every existing row and every existing code path keeps
its meaning. `effort` is the whole-run rating, separate from a set's RIR,
which the logger has never written anyway.

The ALTERs live only in the migration. `schema.sql` builds a database from
nothing and `testdb.ts` applies schema then every migration, so a column in
both would throw on the duplicate.

**The exercise.** One canonical `Run` row, seeded, so every run pools under
one id for records later rather than fragmenting across the catalog's eleven
cardio rows. The dataset does not have it, so `scripts/seed-exercises.mjs`
gains a `SYNTHETIC` list emitted through the same upsert as the dataset rows:

```js
{ id: 'run', name: 'Run', measurement: 'distance_time', progression: 'none',
  equipment: null, movement_pattern: null, primary_muscles: [], aliases: ['Running', 'Jog'],
  cues: 'Distance and time. Surface, route and how it felt go in the note.' }
```

No pattern, so the generator cannot slot it, `rankComplements` cannot
recommend it into leg day, `weeklySetsByGroup` cannot count it, and
`recentTrainedMuscles` cannot mark quads fresh because of it. A mile is not a
leg set. The surviving cardio rows ("Running, Treadmill" and friends) stay
loggable as they are; the form always uses `run`.

**Intervals** are later. In this slice a run is one set. When they come they
are ordered sets with `is_warmup = 1` on the warm-up, recoveries and cool-down,
which is why mileage must sum every row and records must read only work rows
from the start.

## Units

Store metres and seconds, the columns that exist. Display miles and `m:ss`
pace. Convert at the boundary and nowhere else. The one constant is
`1609.344`.

Pace is derived from distance and duration whenever it is shown. It is never
stored and never an input: three independently editable numbers that must
agree is how a log starts lying.

## The module

`src/lib/training/running.ts`, pure like its siblings: no DOM, no D1, no
`$lib` imports, so it runs under `node --test`.

```ts
export const RUN_TYPES = ['easy', 'long', 'tempo', 'intervals', 'race'] as const;
export type RunType = (typeof RUN_TYPES)[number];
export const isRunType = (s: unknown): s is RunType => ...;

export const MILE_M = 1609.344;
export const miles = (m: number) => m / MILE_M;
export const metres = (mi: number) => mi * MILE_M;

/** Seconds per mile, or null when either side is missing or zero. */
export function paceSecPerMi(distanceM: number | null, durationS: number | null): number | null;

/** "7:54" from seconds per mile. */
export function fmtPace(secPerMi: number): string;
/** "24:30", or "1:02:05" past an hour. */
export function fmtClock(seconds: number): string;
/** "3.10" — two decimals, the resolution a watch reports. */
export function fmtMiles(m: number): string;
/** "3.10 mi · 24:30 · 7:54/mi", dropping whatever is missing. */
export function runLine(distanceM: number | null, durationS: number | null): string;

/**
 * "24:30" -> 1470, "1:02:05" -> 3725, "45" -> 45 (bare seconds). Null for
 * anything else, including negatives and empty strings.
 */
export function parseClock(input: string): number | null;

/** Validated form input -> the two numbers the set stores. */
export function parseRunForm(input: { miles: string; clock: string }):
	| { ok: true; distance_m: number; duration_s: number }
	| { ok: false; error: string };

/**
 * The week strip on Train. Rows are finished workouts from roughly the last
 * eight days with their run flag and summed distance; this buckets them into
 * the local week containing `today` (Monday start, the same week streak.ts
 * counts) and sums. Pure so the browser does the bucketing: the server does
 * not know what day the runner thinks it is.
 */
export function weekSoFar(
	rows: { started_at: string; run_type: string | null; distance_m: number | null }[],
	today: Date
): { lifts: number; runs: number; miles: number };
```

`weekIndex` in `streak.ts` is currently private. It becomes an export and
`weekSoFar` uses it, so the strip and the streak can never disagree about
which week it is.

`measurement.ts` gains the fourth predicate:

```ts
export function usesDistance(measurement: string): boolean {
	return measurement === 'distance_time';
}
```

## The payload

`OutboxEntry.workout` and `SyncPayload.workout` gain `run_type` and `effort`.
Both are **optional** on the wire (`run_type?: string | null`): an outbox entry
queued by the build before this one has neither field, and it must still
drain. `ingestWorkout` binds `w.run_type ?? null` and `w.effort ?? null`. The
`INSERT OR REPLACE` lists both new columns, because that statement erases any
column it does not list, and a re-sync from the history editor that dropped
them would silently turn a run back into a strength workout.

So all four places move together: `toPayload` (strength sessions send null),
`HistoryWorkout` and `payloadFromEdits` (carry what was loaded), `SyncPayload`
and `ingestWorkout` (store it). `exportWorkouts` selects `w.*` and needs
nothing.

`ingestWorkout` rejects a `run_type` that is not in `RUN_TYPES` and an
`effort` outside 1–10 with a 400 from the sync endpoint rather than storing
garbage, since the CHECK that would have done it cannot exist.

`ActiveSession` does not change. A run is never a live session, and the
IndexedDB shape and `DB_VERSION` stay exactly as they are.

## Logging a run

**`/run`**, a page, not a modal, reached from a **Log a run** button on Train
beside "Start freestyle session". Fields, top to bottom, every one a 48px
target:

| Field | Input | Default |
|---|---|---|
| Date | `type="date"` | today |
| Distance | decimal, miles, `inputmode="decimal"` | empty |
| Time | text, `h:mm:ss` or `m:ss`, `inputmode="numeric"` | empty |
| Type | five chips: Easy · Long · Tempo · Intervals · Race | Easy |
| Effort | 1–10 stepper, optional | empty |
| Note | one line | empty |

Pace renders live under Distance and Time as soon as both parse. Submit is
disabled until they do. There is no Start button and no clock.

Submit builds a **finished** `OutboxEntry` and calls `enqueue` then
`drainOutbox`, the path a finished session takes, never `saveActive`. So a run
logged in a dead zone keeps until signal, and logging one while a lift is
paused in the logger does not touch that lift.

- `workout.id`: `crypto.randomUUID()`.
- `started_at`: the chosen date at the current wall-clock time if it is today,
  else at noon local. Noon so the heatmap's local-day bucketing cannot push a
  backdated run across midnight in either direction.
- `finished_at`: `started_at + duration_s`. History's duration column reads
  from these two, so it shows the run's time without a special case.
- `notes`, `run_type`, `effort` as entered.
- One set: `exercise_id: 'run'`, `position: 0`, `distance_m`, `duration_s`,
  `weight_lb: null`, `reps: null`, `rir: null`, `is_warmup: false`,
  `completed_at: finished_at`.

After enqueue the page drains the outbox. If the run reached the server it
goes to `/you/history/<id>` so the run is seen written. If it is still
pending (no signal), that page would 404, so it goes to Train instead; the
run drains on the next launch or reconnect like any finished session, and
the account page's existing sync-status line says it is waiting.

Run names are `Easy run`, `Long run`, `Tempo run`, `Intervals`, `Race`, from
one `runLabel(run_type)` in the module so every surface agrees.

## In the logger and the editor

A treadmill mile inside a lift session is real. Both set-input surfaces gain
a **Miles** field when `usesDistance(measurement)`, next to Seconds. The
logger's `logSet` writes `distance_m` from it instead of the hardcoded null.
The input is miles with two decimals; the stored value is metres.

Set rows in both, and the logger's `LAST ·` line, render a distance set with
`runLine`: `3.10 mi · 24:30 · 7:54/mi`. A duration-only set still reads as it
does now.

The logger and the editor already share `measurement.ts` so they cannot
drift; `usesDistance` joins the other three there.

## Where a run shows up

- **History list and the You hub's Recent.** `recentWorkouts` gains
  `run_type` and `total_distance_m` (sum over every set, warm-ups included).
  A run row reads **Easy run** / `Tue, Nov 4 · 24m` / `3.10 mi · 7:54/mi` in
  place of `Freestyle` / `1 sets`. The name is `${Type} run`, capitalised.
- **History detail.** The title is `Easy run`, the meta line adds `effort 6`
  when present. The set row is the `runLine`.
- **Train.** A strip above the routine: `THIS WEEK · 2 lifts · 14.0 mi`,
  from `weekSoFar` over a new `recentActivity(db, uid, days = 8)` query that
  returns `started_at`, `run_type` and summed `distance_m` per finished
  workout. Eight days, because the local week's Monday can be up to seven days
  ago plus a timezone's slack. The strip hides when both numbers are zero.
  Runs with no miles (someone logs 0) count as runs and add nothing.
- **Heatmap and streak.** No change. They read `workout`, so a run lights a
  square and extends a streak the moment it drains.
- **Stats.** `lifetimeTotals.sets` stops counting `distance_time` sets: a run
  is a workout, not a set, and a treadmill mile inside a lift is not a set
  either. The `distance_time` headline record, which today prints raw metres,
  prints miles. The proper Running card is slice 3.
- **Volume, staleness, the generator, recommendations.** Untouched by
  construction: `run` has no pattern.

## Where the code goes

| File | Change |
|---|---|
| `d1/migrations/0002_runs.sql` | New. Two `ALTER TABLE workout ADD COLUMN`. |
| `src/lib/server/testdb.ts` | Apply `0002_runs.sql` after `0001`. |
| `scripts/seed-exercises.mjs`, `d1/seed.sql` | `SYNTHETIC` list with `run`; regenerate. |
| `src/lib/training/running.ts` (+ test) | New. Everything in "The module". |
| `src/lib/training/streak.ts` (+ test) | Export `weekIndex`. |
| `src/lib/training/measurement.ts` (+ test) | `usesDistance`. |
| `src/lib/client/session.ts` | `OutboxEntry.workout` gains the two optional fields; `toPayload` sends null. |
| `src/lib/client/edit.ts` (+ test) | `HistoryWorkout` and `payloadFromEdits` carry them. |
| `src/lib/server/workouts.ts` (+ test) | `SyncPayload`, `ingestWorkout` (store, validate, `?? null`), `recentWorkouts` (`run_type`, `total_distance_m`), new `recentActivity`. |
| `src/routes/api/sync/+server.ts` | 400 on an invalid `run_type` or `effort`. |
| `src/lib/server/stats.ts` (+ test) | `lifetimeTotals.sets` excludes `distance_time`. |
| `src/routes/run/+page.svelte`, `+page.server.ts` | New. The form. Server load only asserts a signed-in user. |
| `src/routes/+page.server.ts`, `+page.svelte` | `recentActivity` → `weekSoFar` strip; Log a run button. |
| `src/routes/workout/+page.svelte` | Miles input; `distance_m` from it; `runLine` in rows and `LAST`. |
| `src/routes/you/history/[id]/+page.svelte` | Miles input in edit; `runLine` in rows; run title and effort. |
| `src/routes/you/history/+page.svelte`, `src/routes/you/+page.svelte` | Run rows. |
| `src/routes/you/stats/+page.svelte` | `distance_time` headline in miles. |

Nothing under `src/lib/training` imports from `$lib`, as before.

## Testing

Pure, under `node --test`:

- `running.test.ts`: pace from distance and time, and null when either is
  missing or zero. `fmtPace` pads seconds. `fmtClock` crosses the hour.
  `parseClock` accepts `m:ss`, `h:mm:ss`, bare seconds; rejects `1:75`,
  negatives, empty. `parseRunForm` rejects zero and non-numeric distance with
  a message a person can act on. `runLine` drops the missing half. `weekSoFar`
  counts a Sunday-night run and a Monday-morning lift in different weeks,
  counts a run with null distance as a run, and ignores rows older than the
  week's Monday.
- `streak.test.ts`: `weekIndex` is Monday-based (a Sunday and the following
  Monday differ by one).
- `measurement.test.ts`: the table gains a `distance` column.
- `edit.test.ts`: `payloadFromEdits` carries `run_type` and `effort` through;
  a workout loaded without them (old row) produces nulls, not undefined.

Server, under `node --test` against `testdb`:

- `testdb.test.ts`: schema plus both migrations apply; `workout` has
  `run_type` and `effort`.
- `workouts.test.ts`: a run payload round-trips with its type and effort. A
  payload with neither field stores null for both (the old-client case). A
  re-ingest from the editor keeps the type. `recentWorkouts` returns
  `run_type` and the summed distance. `recentActivity` returns only finished
  workouts inside the window and only the caller's.
- `stats.test.ts`: lifetime sets exclude a `distance_time` set; the workout
  still counts as a workout.

Not unit-tested, verified in the browser once: the form's live pace, the
pending-sync notice after logging offline, and the three places a run row
renders.

## Risks

- **`INSERT OR REPLACE` and the editor.** The one real way to lose data here.
  A payload from `payloadFromEdits` that lacked `run_type` would un-run the
  workout on the next edit. The test for a re-ingest keeping the type is the
  guard, and `HistoryWorkout` carrying the fields is the fix.
- **Old outbox entries.** A phone with a queued strength workout from the
  previous build posts a payload without the new fields. `?? null` at ingest
  is what keeps it draining. The server deploys before any client can send
  the new shape, since every push deploys.
- **Migration order in production.** Apply `0002` before the deploy that
  reads the columns. `wrangler d1 migrations apply` is a separate step from
  `vite build && wrangler deploy`, and the read of a missing column is a 500
  on every history page.
- **The seed in production.** The `run` row must exist before the first run
  syncs, or `workout_set.exercise_id` points at nothing and the history
  detail's join drops the set. The sync endpoint does not enforce the foreign
  key (the schema declares none on `workout_set.exercise_id`), so this would
  fail quietly. That is why the row rides migration `0003_seed_run.sql`
  rather than waiting for a by-hand `seed.sql` run, and why `deploy:ci`
  applies migrations before `wrangler deploy`.
- **Date input and time zones.** `type="date"` yields `YYYY-MM-DD` with no
  zone. Building `started_at` with `new Date(y, m - 1, d, 12)` keeps it local;
  `new Date('YYYY-MM-DD')` would parse as UTC midnight and land yesterday
  evening west of Greenwich.
