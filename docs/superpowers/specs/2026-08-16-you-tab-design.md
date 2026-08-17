# The You tab

## Problem

`/history` is a list and nothing else. The account — email and sign out — sits
at the bottom of `/gym`, where it was put because `/gym` was already the
settings-shaped page and a fifth tab was not worth it. That reasoning holds only
while there is nowhere better. There is no view of what training has actually
amounted to: no totals, no records, no read on whether the last month happened.

Everything needed to answer those questions is already in `workout` and
`workout_set`. Nothing queries it.

## What this is

`/history` becomes `/you` — a tab for the person rather than the log. It holds
the training heatmap and streak, a stats page, the history that used to be the
whole tab, and the account.

Personal records come along, but not as a page of their own. They belong to the
exercise, so they render in the exercise guide behind the ⓘ.

## Non-goals

- **Kilograms.** `lb` is in column names, plate math, and every label. Its own
  project.
- **Bodyweight and measurements.** New table, new logging surface. Its own
  project.
- **Per-exercise trend charts.** The highest-value thing not in this spec, and
  the largest. Deferred deliberately.
- **Time as an aggregate.** No "hours under the bar" on the stats page. Summing
  session length across a lifetime measures attendance, not training. A
  *record* held in time is a different thing and is in scope — see below. The
  duration already shown on a history row stays because it is existing
  behaviour, not a new statistic.
- **Flagging a PR as the set is logged.** Same data, and the moment it means
  most — but it changes the logging surface, and records in your face mid-set is
  the opposite of what this tab is for.

## Naming and routes

| Route | Holds |
|---|---|
| `/you` | Heatmap, streak, last five workouts, link rows |
| `/you/stats` | Lifetime totals, tonnage as plates, volume by muscle group |
| `/you/history` | The list as it exists today, edit and delete intact |
| `/you/history/[id]` | Workout detail, moved unchanged |
| `/you/account` | Email, member since, change password, sync status, export, sign out |

The tab reads **You**, matching the second person the rest of the app is written
in. `/history` answers 308 to `/you/history`: the app is installed as a PWA and
something may hold the old URL. The finish-workout redirect and the tab bar are
repointed.

`/gym` gains a link row on the hub. Today it is reachable only from two links
inside the routines pages, which is not where anyone looks for it.

## The hub

A heatmap of the last twenty-six weeks, the current streak, the five most recent
workouts, and rows out to stats, history, account, and gym setup.

### Local days

`date(started_at)` in SQL is UTC, so a seven-o'clock evening session on the west
coast lands on tomorrow's square. The server has no idea what zone the lifter is
in and no reason to store one.

So `trainingDays` returns raw timestamps — a few hundred rows for twenty-six
weeks — and the browser buckets them by local day. The streak is computed from
those buckets for the same reason. Both live in `src/lib/training/streak.ts` as
pure functions, which is also what makes the boundaries testable.

A streak counts consecutive weeks containing at least one finished workout. Not
days: nobody trains daily, and a day-streak that breaks every rest day measures
nothing.

## Stats

**Lifetime totals** — workouts, sets, reps, tonnage. One query, warmups and
unfinished workouts excluded, matching what `recentWorkouts` already does.

**Tonnage as plates** — the same number divided by forty-five. This is the
"how many plates have been lifted" question, and it needs a caveat rather than a
disclaimer buried somewhere: bodyweight exercises store `weight_lb` as NULL, so
pull-ups and dips contribute nothing. The figure is real, but it is a barbell and
dumbbell figure, and squats dominate it. The UI says so in one line.

**Volume by muscle group** — sets per group over the last seven and twenty-eight
days, against what the active routine plans. Primary muscles count full,
secondaries half, exactly as `weeklySetsByGroup` already scores the routine. That
existing function scores the *plan*; this scores what actually happened, and
showing them in one row is the point — it is the only view in the app that can
say a group is being under-trained rather than merely under-planned.

**The drill-down.** Each group row expands to the exercises trained for it, one
headline record each, with the set that produced it and the ⓘ that opens the
full breakdown:

```
BACK            14 sets / wk    planned 16
  Barbell Row        185 × 8 · 234 est.    Mar 4   ⓘ
  Lat Pulldown       150 × 10 · 200 est.   Mar 2   ⓘ
  Dead Hang          1:20                  Feb 27  ⓘ
```

The headline is the first record its measurement offers: estimated 1RM for
loaded lifts, most reps, longest hold, furthest. Loaded lifts sort first by that
estimate, and the rest follow ranked by recency — a hold and a squat share no
scale, and pretending they can be ordered against each other would invent a
comparison the data cannot support.

One query feeds this, the metric chosen by a `CASE` on measurement so that a
single `MAX` still carries its own row's bare columns. There is no second records
interface: the stats page shows one number per lift and the guide holds the
detail.

Exercises with no movement pattern — cardio and oddities — group under **Other**
rather than disappearing, which is what `weeklySetsByGroup` does to them.

**One line at the top:** "2 new records in the last 30 days." It is the thing
that makes anyone open the drill-down at all.

## Records live in the guide

The ⓘ is `GuideLink`, which shallow-routes `/exercises/[id]` into a modal. It
appears on the workout page, in the exercise picker, and on the warmup card, and
all three read the same loader. Adding records to that loader puts them
everywhere the ⓘ already is, for the cost of one file.

`ExerciseGuide` gains a `records` prop and renders a **Records** card directly
under **Last time**, so the ⓘ reads in the order a lifter wants it: what you did
last, then what your best is, then the cues and the video.

Because it is one exercise, the measurement is known and the card is not a mixed
list:

| Measurement | Records shown |
|---|---|
| `load_reps` | Heaviest · best estimated 1RM · best single set |
| `load_time` | Heaviest · longest hold |
| `reps_only` | Most reps |
| `time` | Longest hold |
| `distance_time` | Furthest · longest |

A record measured in time is a record. A plank held for three minutes and a
weighted carry held for ninety seconds are both progress, and there is nothing
else to measure them by. This is the only place duration is tracked, and it is
tracked per exercise rather than summed.

Estimated 1RM is Epley, `weight × (1 + reps / 30)`. It ranks 225×5 above 245×1,
which is the truer read of what someone can do. Each line carries the set and the
date that produced it, so the formula is never the only thing on screen.

The loader reads that exercise's non-warmup sets from finished workouts — an
indexed range scan on `idx_set_exercise_time` — and a pure
`bestRecords(sets, measurement)` picks the winners. That is deliberately not
aggregate SQL: it means every record rule is testable without a database. It
reads every set for the lift, which is what a lifetime best requires and is cheap
at this size. If it ever stops being cheap it collapses into a single `MAX`
query.

## Account

Moving email and sign out off `/gym`, plus three things that do not exist yet:

**Change password.** Requires the current password, minimum ten characters to
match signup, and on success revokes every session except the one in hand. There
is no reset flow and no way to send email — this is the only recovery lever the
app has, which makes it the most important control on the page. The session
revocation is the "log out everywhere" the multi-user spec deferred, arriving
almost free.

**Export.** `/you/account/export` returns every workout and set as JSON. The app
is offline-first with no backups and no password reset. This is the safety net.

**Sync status.** The outbox count, from the `outboxCount()` that already backs
the sign-out warning. If finished workouts are sitting undelivered, this is where
that fact belongs.

## Where the code goes

Pure, no database, node --test directly:

- `src/lib/training/records.ts` — `epley`, `bestRecords`, `plateEquivalent`
- `src/lib/training/streak.ts` — `bucketByLocalDay`, `currentStreak`
- `actualSetsByGroup` is added to the existing `volume.ts`, beside
  `weeklySetsByGroup`. Same domain, same `muscleGroup` map, and putting the
  planned and actual scorers in one file is what lets the stats page compare
  them without either knowing about the other.

New `src/lib/server/stats.ts`, every export taking `userId` like the rest of the
server layer: `trainingDays`, `lifetimeTotals`, `topRecordsByGroup`,
`volumeByGroup`. `exerciseSets` for the guide goes in `workouts.ts`, next to
`lastPerformances`, which asks nearly the same question.

`changePassword` joins `auth.ts`.

## Testing

The multi-user work tested that user B gets null on every scoped function.
Repeating that here would be theatre: there is one account. The queries still
take and filter on `userId` — the compiler enforces it and it costs nothing — but
the test budget goes where a wrong answer is silent rather than absent:

- Epley, and the record picked for each measurement
- Local-day bucketing across a UTC boundary, which is the bug this design exists
  to avoid
- Streak boundaries: the current week not yet trained, a gap week, an empty
  history
- Primary-full / secondary-half scoring against a known set of rows
- Tonnage with NULL weights present, since that is the caveat the UI makes

`changePassword` gets tests for a wrong current password, for other sessions
being revoked, and for the current session surviving.

## Risks

- **Every push deploys.** This moves the tab muscle memory reaches for and
  relocates six routes. A broken link ships live. The 308 and prefix-matched
  `isActive` are the mitigations, and every route is checked against the running
  dev server before merge.
- **Tonnage will be misread.** A number that ignores every bodyweight lift looks
  authoritative next to a heatmap. The one-line caveat is load-bearing, not
  decoration.
- **Estimated 1RM is an estimate.** Epley is unreliable above about ten reps.
  Showing the real set beside it is what keeps it honest.
