# Run insight (slice 3)

**Status:** implemented 2026-11-16 on `feat/run-insight`. The card and the
`/run` line were server-rendered against sample rows but not yet looked at on
a phone. Slice 3 of
`2026-11-09-running-and-bodyweight-direction.md` §2, §4 and §6. Builds on
slice 1 (`2026-11-09-log-a-run-design.md`). Slice 2 (Garmin pull) is still
parked; nothing here depends on it.

## Goal

Runs are in the log. This slice makes them something to read: miles this week
against last, twelve weeks of bars, the distance past which the next run is a
spike, and the best time at each standard distance. No migration, no new
table, no composite score.

## Non-goals

- The 10% weekly rule. Weekly change is shown as two plain numbers.
- Anything from §5 of the direction doc: predictors, zones, ACWR, fitness and
  fatigue, kilometres, a calendar.
- Treadmill miles logged inside a lift. A run is a workout with a `run_type`,
  the same rule the week strip on Train already follows, so the card and the
  strip cannot disagree.
- Charts beyond the twelve bars. No chart library.

## Data flow

One new read in `src/lib/server/stats.ts`:

```ts
export interface RunSetRow {
	workout_id: string;
	started_at: string;
	distance_m: number;
	duration_s: number | null;
	is_warmup: number; // 0 | 1, as stored
}

/** Every distance set in a finished run workout, oldest first. `days` bounds
 *  it for callers that only need a recent window. */
export async function runSets(db, userId, days?: number): Promise<RunSetRow[]>;
```

`WHERE w.user_id = ? AND w.finished_at IS NOT NULL AND w.run_type IS NOT NULL
AND ws.distance_m IS NOT NULL`. The whole history goes to the browser: one
user, a few hundred rows a year, and records and the biggest week need all of
it. The browser does every bucket, because SQL would bucket weeks in UTC and
the server does not know what day the runner thinks it is. This is the rule
`streak.ts` and `weekSoFar` already follow.

## The module

`running.ts` gains, all pure:

```ts
export interface RunSet { workout_id: string; started_at: string;
	distance_m: number; duration_s: number | null; is_warmup: number | boolean }

/** Miles per local Monday-start week, oldest first, `weeks` long, zero-filled.
 *  The last entry is the week containing `today`. Every row counts, warm-ups
 *  and recoveries included: mileage is mileage. */
export function weeklyMiles(rows: RunSet[], today: Date, weeks = 12): number[];

/** The per-run guardrail. A run is a workout: its sets summed. The longest in
 *  the 30 days up to `now`, and that × 1.1. Null with no run in the window. */
export function spikeCap(rows: RunSet[], now: Date): { longest_m: number; cap_m: number } | null;

export const STANDARD_DISTANCES = [
	{ key: 'mile', label: 'Mile', m: 1609.344 }, { key: '5k', label: '5K', m: 5000 },
	{ key: '10k', label: '10K', m: 10000 }, { key: 'half', label: 'Half', m: 21097.5 },
	{ key: 'marathon', label: 'Marathon', m: 42195 } ] as const;

/** Best time at each standard distance that has one. A work set (not a
 *  warm-up) counts when its distance is within −2% / +4% of the standard,
 *  which absorbs GPS noise. Its time is scaled to the exact distance, and the
 *  real set rides along so the page can show it, the rule Epley follows. */
export function standardRecords(rows: RunSet[]): StandardRecord[];
// { key, label, time_s, distance_m, duration_s, started_at }

export function longestRun(rows: RunSet[]): { distance_m: number; started_at: string } | null;

/** The local week with the most miles, named by its Monday (YYYY-MM-DD). */
export function biggestWeek(rows: RunSet[]): { miles: number; monday: string } | null;
```

The spike rule is a cited position, not a folk rule: in a 5,205-runner cohort
a single run more than 10% past the longest of the previous 30 days was
associated with injury, and week-over-week change was not. The cohort is
observational and distance-only, and the page says so.

## Stats

**Running card**, `src/lib/components/RunningCard.svelte`, above "Sets by
muscle group". Hidden when there are no rows.

```
RUNNING
14.0 mi this week · 12.5 last
▂▃▅▃▆▅▇▆▅▇▆█
Longest in 30 days is 6.5. Past 7.2 is a spike.
One observational study, distance only. A suggestion.
5K        24:10 · 7:47/mi      3.12 mi in 24:16 · Nov 4
Longest   8.20 mi · Oct 19
Biggest week   21.4 mi · week of Oct 12
```

Twelve CSS bars, heights relative to the tallest week, the current week in
full text colour and the rest dim. No plate colours: those are data for
barbells. Each bar carries its miles as an accessible label. The spike line
and its caveat hide when no run falls in the last 30 days.

**Lifetime totals.** `lifetimeTotals` gains `runs` and `run_m` from a third
batched query over run workouts (every set, warm-ups included). The grid
shows **runs** and **miles** cells when `runs > 0`.

**The Run row leaves the records list.** `headlineRecords` ranks
`distance_time` by furthest, which is the card's "Longest" said worse. The
page filters `exercise_id === 'run'` out of the group list and the "new
records" count.

## The run form

`/run` shows the same line under the pace: "Longest in 30 days is 6.5. Past
7.2 is a spike." Its load calls `runSets(db, uid, 31)`. The line turns to the
signal colour when the typed distance is past the cap. It never blocks Save.
It shows only when the date is today: the fetched window is anchored on now,
and a guardrail for a run already run is no use.

## Where the code goes

| File | Change |
|---|---|
| `src/lib/training/running.ts` (+ test) | The five functions and `STANDARD_DISTANCES`. |
| `src/lib/server/stats.ts` (+ test) | `runSets`; `lifetimeTotals` gains `runs`, `run_m`. |
| `src/lib/components/RunningCard.svelte` | New. |
| `src/routes/you/stats/+page.server.ts`, `+page.svelte` | Load `runSets`; card; totals cells; drop the Run row. |
| `src/routes/run/+page.server.ts`, `+page.svelte` | Load the 31-day window; the spike line. |

## Testing

Pure:

- `weeklyMiles`: a Sunday-night run and a Monday-morning run land in
  different weeks; warm-up rows count; weeks with nothing are zero; rows
  older than the window are ignored; the array is `weeks` long.
- `spikeCap`: sums a workout's sets into one run; ignores a run 31 days old;
  null when the window is empty.
- `standardRecords`: 4,900 m and 5,200 m count as a 5K and 4,899 m and
  5,201 m do not; time scales to 5,000 m; the faster of two wins; a warm-up
  row never holds a record; a row without a duration is skipped.
- `longestRun`, `biggestWeek`: workout sums, the Monday date, null on empty.

Server, against `testdb`:

- `runSets`: only finished run workouts, only the caller's, only sets with a
  distance, and the `days` bound.
- `lifetimeTotals`: `runs` and `run_m` count runs and nothing else; zero with
  none.

Browser, once: the card with real runs and with none, and the line on `/run`.
