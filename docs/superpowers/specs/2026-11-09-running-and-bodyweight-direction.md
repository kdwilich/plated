# Running, bodyweight, and what the app is

**Status:** direction accepted 2026-11-09. Plated stays (§1). Slices 0 and 1 done on `feat/log-a-run`; slice 4 done on `feat/bodyweight-foundations` (`2026-11-10-bodyweight-foundations-design.md`, migration 0005 since the split review took 0004); slice 5 done on `feat/chains` (`2026-11-12-chains-design.md`, migration 0006); slice 2 (Garmin pull) is optional and decided after a couple of weeks of manual entry.
**Date:** 2026-11-09

Three independent delegates (Claude Opus 5.5, Muse Wonder Full 1.0, GPT-6.1
Sol, all at xhigh effort) read the repo and proposed how to add run tracking
and first-class bodyweight training. This document is the synthesis: where
they agreed, where they split, and the direction that follows. Each slice in
§6 still gets its own spec and plan in the usual way.

## Problem

The user trains mostly by running and calisthenics now and rarely in a gym.
The app stores both already, but every decision it makes assumes a barbell:

- A push-up at the top of its rep range gets `add_load`, +10 lb. `incrementFor`
  returns the machine step for every `body only` exercise regardless of
  measurement, so a `reps_only` exercise is told to add a weight it has no
  field for. The logger then prefills reps back to `rep_min` every session.
  (`progression.ts`, `workout/+page.svelte`)
- A bodyweight pull-up cannot hold a record. `bestRecords` drops any score
  `<= 0`, so 15 reps at net 0 lb, or 10 at −40, is nothing. Stats prints
  `0 × 15 · 0 est.` (`records.ts`, `you/stats/+page.svelte`)
- A `body only` gym generates a week full of warnings. The seed excludes
  bodyweight squats from the squat pattern by rule (`seed-exercises.mjs:112`),
  `/gym` refuses to save without at least one plate, and `body only` does not
  distinguish the floor from a pull-up bar.
- The catalog has no knee or archer push-up, dead hang, L-sit, pistol squat,
  Nordic curl or handstand hold. The rungs calisthenics progresses through do
  not exist as rows.
- `workout_set.distance_m` exists and flows through the outbox, sync and
  editor, but the logger hardcodes `distance_m: null` and nothing renders
  distance or pace. A run is a set with a duration.

Two more things the delegates found that are not features:

- `npm test` is red. Two server tests pin `2026-03-01` fixtures that have aged
  out of their 26-week and 30-day windows (`stats.test.ts`, `workouts.test.ts`).
  Date rot, not a code bug, but `&&` in the test script then skips the client
  suite. Verified: 146/146 training, 83/85 server, 15/15 client.
- The Plated rename is not on `main`. `origin/main` still says
  `name = "plateload"` and has no `brand.ts`. This branch sets the Worker
  `name` to `plated`, which is the one line that moves the origin and strands
  the installed PWA, cookie and IndexedDB (`docs/renaming-the-app.md` §5).

## 1. Identity

**Verdict: keep Plated for now. Reframe it as a training log. Never move the
origin. Decide the display name after a month of logging runs.**

The council split 2–1. Muse and Sol: keep the name, the identity in the code
is the approach, not the implement. Opus: rename to SPLITS now, ship it with
the first run slice, because "the day the app logs a run is the day the
barbell stops being true."

All three agreed on the things that matter more than the string:

- **The name and the origin are separate decisions**, and the rename doc
  prices them together. `APP_NAME`, the manifest, `app.html`, `package.json`
  and the icon are an hour. `wrangler.toml` `name` is the only expensive line.
  A standalone PWA has no address bar, so the Worker can stay `plateload`
  forever under any display name. **Revert that one line on this branch
  before it deploys.** (Check Cloudflare first for whether a `plated` Worker
  was ever created; if so, delete it, it serves nothing anyone needs.)
- **The real identity is the approach.** Cited prescriptions over sliders
  (`profiles.ts`), suggestions the user can always override
  (`progression.ts`), one write path (`edit.ts`), works in a dead zone, no
  feed. True of a squat, a pull-up and a tempo run alike. The tabs (Train,
  Routine, Exercises, You) are already neutral.
- **The look stays.** Barlow Condensed caps, the near-black ground, big
  numerals, 48px targets. Plate red and blue retire to where they are data
  (`PLATE_COLORS`, `PlateBar.svelte`) and stay there for barbell work.
- **The barbell icon eventually goes.** Candidates: a diagonal-cut square in
  the plate colors with a white bar slash (Opus), a tally or check block in
  the same flat-rectangle geometry (Muse), a stepped-bar mark from the plate
  geometry (Sol). `make-icons.mjs` works unchanged for any of them.

Why keep the name this round: it was changed two commits ago and the rename
doc's own rule is to be settled first. Nobody is settled until running has
been logged for a while and it is known whether it is 20% or 80% of training.
"Plated" survives re-reading as *done and recorded*, and the supporting copy
"Training, logged." carries the reframe without touching the wordmark.

If it is renamed later, the shortlist from the council, best first:

| Name | For | Against |
|---|---|---|
| **SPLITS** | A lifter's split, a runner's splits, the gymnast's splits; the generator the last twenty commits went into | None serious |
| **LOGGED** | Same `-ED` grammar as PLATED; names the product | Flat as a training word |
| TEMPO | Tempo runs, tempo eccentrics | Leans running |
| TRAINED | Broadest honest claim | Generic |

## 2. Running

**Verdict: a run is a `workout`. Logged after the fact. One new pure module.
No GPS, ever.**

Unanimous points:

- The web has no background geolocation and iOS suspends a backgrounded PWA.
  The watch or phone records; this app is the log of record. "Comprehensive"
  means every run with type and effort, honest weekly mileage, and PRs at
  raced distances. Not Strava.
- Store meters and seconds, display miles, derive pace. Never persist three
  independently editable quantities. Kilometres are their own project, as
  kilograms already are.
- A **Log a run** form on Train, not a fifth tab and not a live session:
  date, distance, h:mm:ss, type (easy, long, tempo, intervals, race), effort
  1–10, notes. It builds a *finished* outbox entry and calls `enqueue` then
  `drainOutbox`, never touching `active_session`, so the IndexedDB shape and
  `DB_VERSION` do not change.
- A new `usesDistance` in `measurement.ts`, with the matching input in the
  live logger and the history editor in the same slice, so a treadmill mile
  inside a lift finally records.
- `training/running.ts`: pace, formatting, weekly mileage bucketed by local
  day the way `streak.ts` does, standard-distance records. Records live here
  and not in `records.ts`: that module's `distance_time` kinds reward
  furthest and longest, which is backwards for a 5K.
- Runs carry no `movement_pattern`, so `weeklySetsByGroup` and the generator
  cannot see them. A mile is not a leg set. Heatmap and streak pick runs up
  for free because they read `workout`.
- No ACWR, fitness/fatigue curves, VO2max, race predictors or HR zones.

**Split: how to model a run.** Opus and Muse: a `workout` with `distance_time`
sets against one canonical seeded `Run` exercise, plus two nullable workout
columns. Sol: a `run` child table keyed on `workout_id` with no sets.

Workout-plus-sets wins. The columns exist, the outbox and editor already carry
`distance_m`, and a child table forks ingest, edit, export and delete against
the one-write-path rule the codebase already states. Intervals are ordered
sets, with `is_warmup = 1` on warm-up, recoveries and cool-down so mileage sums
every row and records read only work rows. Surface goes in `notes`; one `Run`
exercise pools PRs instead of fragmenting them across the catalog's eleven
cardio rows.

```sql
-- d1/migrations/0002_runs.sql. Additive. No CHECK: SQLite cannot alter one,
-- and rebuilding `exercise` or `workout` means dropping referenced tables.
ALTER TABLE workout ADD COLUMN run_type TEXT;  -- NULL = not a run
ALTER TABLE workout ADD COLUMN effort INTEGER; -- session RPE 1–10
```

The `Run` exercise does not exist in the dataset, so `seed-exercises.mjs`
gains a small `SYNTHETIC` list emitted beside the dataset rows: stable id,
`distance_time`, `progression = 'none'`, no pattern. The same list carries the
calisthenics staples in §3.

**Split: the 10% rule.** Muse flags >10% week over week with an honest "weak
evidence" caveat. Sol makes it an optional labelled nudge. Opus would drop it:
the one randomised trial of graded progression found no benefit, and a
5,205-runner cohort found week-to-week ratio was not associated with injury
but a single run more than 10% past the longest in the last 30 days was
(adjusted HRR 1.64 at 10–30% over, 2.28 past 100%).

Opus's version wins because it matches how `profiles.ts` already works: a
cited position, not a folk rule. Weekly change is shown as a plain number. The
guardrail is per run: `cap = longest in 30 days × 1.1`, rendered as "Longest
in 30 days is 6.5. Past 7.2 is a spike." Suggestion only, with the caveat that
the cohort is observational and distance-only.

**Records.** A set counts toward mile, 5K, 10K, half or marathon when within
−2% / +4% of it, to absorb GPS noise. Time scales to the exact distance and
the real set is always shown, the rule Epley already follows. Plus longest
run and biggest week.

**Getting runs off the watch.** The user records on a Garmin watch that syncs
to Strava, is not a Strava subscriber, and does not want an import workflow.
Three routes were checked:

- **Strava's API is out.** Since June 2026 the athlete must be a paid Strava
  subscriber to create or keep an API app, even a single-player one. Its
  refresh tokens also rotate, which means OAuth plumbing and a token table.
- **Scraping Garmin Connect's private endpoints is out.** The unofficial
  libraries broke in March 2026 when Garmin changed its SSO, and they depend
  on MFA workarounds. Not something to build a log on.
- **Garmin's Personal API is in.** Garmin reopened its Connect Developer
  Program on 21 October 2026 with a new Personal tier: an individual creates
  a key in Garmin Connect settings, no application, no approval, free. It is
  pull-only and read-only, for your own account, and explicitly "not intended
  for commercial applications serving multiple end users". That is this app.

What the Personal API actually is, read from Garmin's published OpenAPI 3.0.1
spec (the swagger page renders it client-side; the spec is embedded in the
page's script):

- Base URL `https://personal.connectapi.garmin.com`. Create the key at
  `connect.garmin.com/app/settings/personalApiToken`, choosing an expiry of
  30, 90, 180 or 365 days. Garmin emails a week before it lapses. The key is
  shown once.
- `POST /personalapitoken-service/personal-api/personal-api-key/token` with
  header `Authorization: ApiKey <key>` returns an access token valid for 24
  hours. No refresh tokens: ask again with the key. So the **key** is the
  stored secret, and since it is long-lived and user-pasted it fits a
  per-user `garmin_account` row (key, expiry, last pulled date) or, for one
  user, a Worker secret. The row is better: the account page can show expiry
  and accept the yearly re-paste.
- `GET /activitylist-service/activities/search/activities` with
  `activityType=running`, `startDate`, `endDate` (YYYY-MM-DD, local),
  `start`, `limit` (default 99), `sortOrder=asc`. Returns summaries with
  `activityId`, `activityName`, `description`, `activityType.typeKey`
  (running, trail_running, treadmill_running), `distance` (m), `duration`,
  `movingDuration`, `elapsedDuration` (s), `averageSpeed` (m/s), `averageHR`,
  `elevationGain`, `lapCount`, `eventType` (race, training, ...). Date filters
  exist, so a pull is "everything since the last pulled day", one request for
  a normal week.
- `GET /activity-service/activity/{activityId}` returns the detail with
  `splitSummaries`, each with its own `distance`, `duration`, `averageSpeed`
  and `averageHR`. Fetch it only when `lapCount > 1` and write the laps as
  ordered sets, so interval sessions arrive with structure.
- `GET /download-service/files/activity/{activityId}` returns the original
  FIT in a zip. Not needed; summaries carry everything the log stores.
- Rate limits are not documented anywhere in the spec or FAQ. The pull is a
  request or two per week, so this is unlikely to matter, but the client
  should back off on 429 and the button should not be mashable.
- Caveats: the tier is three weeks old at the time of writing, so expect
  rough edges. Garmin's updated agreement forbids using the data to train AI
  models and transferring keys or data to third parties. Storing your own
  runs in your own log is the intended use. Historical depth is not stated
  for Personal; the backfill is simply a wide `startDate`, paged by `start`.

**Mapping.** One activity becomes one `workout` with `run_type` and `effort`
(effort stays empty, Garmin has no RPE field in the summary) and one
`distance_time` set from `distance` and `movingDuration`, or the laps as sets
when there are several. `eventType = race` → race; otherwise the type is
inferred from the name ("Long", "Tempo", "Intervals") and left as easy when
nothing matches, editable afterwards like any workout. `activityName` and
`description` go to `notes`. `workout.id` derives from
`garmin:<activityId>`, so existing idempotency dedupes a re-pull without an
`external_id` column, and rows that already exist are skipped so a re-pull
never clobbers edits. The mapping is a pure `training/garmin.ts` with fixture
JSON from the real API, so the Worker code is a thin fetch.

**The user's own position: manual entry might be enough.** It might. The
manual **Log a run** form is slice 1 either way: it is the treadmill path, it
validates run-as-workout before anything depends on it, and it needs no key.
The Garmin pull is slice 2 because it is small (no OAuth, one key, two GET
calls) and because double entry is what kills a log. If after slice 1 typing
a run in feels fine, slice 2 can simply not happen.

## 3. Bodyweight and calisthenics

**Verdict: curated progression chains in a pure module, modelled on
`mobility.ts`. A rung is the load. No tables, no builder UI.**

Unanimous points:

- Double progression says hit the top of the range, then make it harder. On a
  barbell, harder is five pounds. On the floor, harder is the next exercise.
  `training/chains.ts` holds hand-curated linear chains (push, pull, row,
  squat, hinge, dip, L-sit, handstand), each rung an `exercise_id` with a
  graduation target in reps or seconds. A test asserts every id resolves in
  the seed. An exercise belongs to at most one chain.
- **The current rung is not stored anywhere new.** `routine_exercise.
  exercise_id` *is* the rung, and `updateRoutineExercise` already accepts it.
- `suggestChain()` wraps `suggest()`. Advance when the last two sessions both
  logged at least `target_sets` with every working set at the graduation
  target. Two sessions, because a rung is a bigger jump than a plate. Hold
  the rung if the next one needs kit the gym lacks. Regress when the first set
  was under `rep_min` two sessions running (the existing deload requires
  `topWeight !== 0`, so bodyweight has none today). Otherwise fall through to
  `suggest()`: more reps, or added load on a top rung like pull-ups.
- The logger shows "Move up: Archer Push-Up" and reuses `swapExercise` with a
  one-tap confirm. The user confirms every swap. Nothing rewrites history.
- `incrementFor` returns 0 unless the measurement uses load. This fixes the
  push-up bug at its source.
- Net-load exercises drop Epley for **most reps at bodyweight, most added,
  least assistance**. `headlineRecords` keeps its single `MAX` with
  `weight*1000 + reps` as the rank key, and the stats page stops ranking these
  against Epley. No body-mass log to rescue Epley; a fake pull-up 1RM helps
  nobody. Tonnage keeps its one-line caveat.
- Statics already work (`time`, `progression = 'time'`); a chain only adds the
  graduation threshold.
- Flip the seed's bodyweight-squat exclusion and let priority do its job
  (`body only` base 26 vs barbell 50 already protects barbell gyms).
- `/gym` gets presets **Floor only / Pull-up bar / Full gym**, and the
  at-least-one-plate validation relaxes when no barbell equipment is checked.
- About eight to twenty synthetic catalog rows with cues: dead hang, L-sit,
  wall handstand hold, archer push-up, knee push-up, pistol squat, Nordic
  curl, and the missing rungs the chains need. Every rung gets a pattern or it
  earns no volume. Choosing rungs and graduation numbers is the real cost of
  this feature, not the code.
- Density, EMOM and rep ladders are session structures, not progression. They
  go in `notes`.

**Split: how to say an exercise needs a bar.** Opus: retag pull-ups to a new
`equipment = 'pull-up bar'` and migrate every gym holding `body only` to also
hold the new key. Muse: keep `equipment = 'body only'` and add a derived
`requires_bar` column, because `allowsNegativeLoad` and `incrementFor` key off
the `body only` string.

Muse's wins. It is one additive column (`0004`), one free-form `gym_equipment`
key (`pull-up bar`) with no gym migration, and nothing that currently works
changes meaning. The seed derives `requires_bar` by name the way it derives
everything else.

**Rejected:** Sol's typed `prescription_json`, versioned chains, per-set
`context_json` snapshots and quality-confirmation gates. Correct in a
multi-user product, over-engineered for one user whose history is readable
without them. Also rejected: a body-mass log, a chain builder, skill trees.

## 4. A hybrid week

**Verdict: log first, plan later. No calendar.**

Three different answers here. Muse: do not reconcile yet; runs are freestyle
workouts, Train shows the lifting rotation untouched plus "Log a run" and one
line, `THIS WEEK · 2 lifts · 14.0 mi`. Opus: run days as `routine_session`
rows with `run_type` and `target_m`, two tracks in one routine each with its
own "next up", so a missed leg day cannot block the long run. Sol: a dated
`planned_session` layer with seven day rows, copy/move/skip, and Routine
renamed to Plan.

Muse's answer is v1 and Opus's is the gated next step. Sol's calendar is
rejected: two delegates independently argued that pinning sessions to
weekdays manufactures failed days, `volume.ts` states "there is no calendar: a
routine is a rotation" as a principle, and the user knows when Sunday is.

What everyone agreed the stats page must do: a Running card (weekly miles,
12-week bars, spike line, standard-distance PRs) *above* the untouched
sets-per-group table. **No composite number.** Miles and sets share no scale,
the same argument the stats page already makes about a hang and a squat.
`lifetimeTotals` gains miles and run count and stops counting run rows as
sets. The heatmap does not change at all.

If run days land (slice 5): nullable `run_type`, `target_m`, `target_note` on
`routine_session`; NULL means strength so every existing routine behaves
exactly as now; `nextPosition` gets a track-aware sibling; `routineToDraft`
and `saveRoutineFromDraft` must carry the fields or duplicating a routine
erases its run days. One suggestion-only line after a hard run: "Intervals
yesterday. Upper might suit today." Fatigue scheduling, not interference
panic; concurrent training does not compromise hypertrophy or strength
(Schumann 2022). The generator never programs runs.

## 5. Scope: not building

- Live GPS, maps, routes, audio cues, background recording.
- Strava, in any form. Its API now requires a paid subscription the user
  does not have and does not want.
- Scraping Garmin Connect's private endpoints, FIT parsing, GPX parsing, or
  any watch-to-app integration. The Personal API summaries are enough.
- Pulling health data (sleep, HRV, body battery) even though the Personal
  API offers it. This is a training log.
- Writing anything back to Garmin.
- A `run` table or a second sync path.
- Generated running programmes, periodisation, VDOT, race predictors, HR
  zones, ACWR, fitness/fatigue, readiness, any composite load score.
- A calendar or weekday pinning.
- Body-mass tracking to make Epley work for pull-ups.
- Chain builder UI, skill trees, density/EMOM/ladder scheme engine.
- Counting runs toward muscle volume or tonnage.
- Kilometres or kilograms.
- A service worker. "Offline-first" today covers an open session, not a cold
  launch. Real, but separate work.
- The rename, this round. And when it happens, no visual redesign beyond the
  mark.

## 6. Slices

Each slice is one spec, one plan, TDD, useful on its own.

| # | Slice | Size | What it buys |
|---|---|---|---|
| 0 | **Truth pass.** *Done 2026-11-09.* Clock-relative test fixtures. `incrementFor` takes the measurement and returns 0 without a load axis. Net-load records are bodyweight reps, most added, least assistance, in the pure module and the headline query, with the guide and stats page showing `BW × 12` instead of `0 × 12 · 0 est.`. `wrangler.toml` `name` back to `plateload`. | S | Bodyweight logging stops lying. The suite is green before any mileage test inherits the date bomb. The origin cannot move by accident. |
| 1 | **Log a run.** *Done 2026-11-09, `feat/log-a-run`.* Migration 0002. Synthetic `Run`. `usesDistance` plus inputs in logger and editor. `/run` form via the outbox. `running.ts` pace. History rows render `3.10 mi · 24:30 · 7:54/mi`. Week strip on Train. | M | What the user does most, in history, heatmap, streak and export. Validates run-as-workout before anything builds on it. |
| 2 | **Garmin pull.** *Optional, decided after slice 1.* `garmin_account` table (0003) holding the pasted key and expiry; a key field under account; Pull from Garmin on Train; `training/garmin.ts` mapping with real-response fixtures; laps as sets when `lapCount > 1`. | S–M | Every run on the watch lands in the log without typing. No OAuth, one key, two GET calls. |
| 3 | **Run insight.** Weekly and 12-week mileage, spike cap, standard-distance PRs, Running card on stats, miles in lifetime totals. | S–M | The log becomes something to read, over real history rather than a few hand-typed runs. |
| 4 | **Bodyweight foundations.** *Done 2026-11-10.* Seed squat fix. `requires_bar` (0004) and the `pull-up bar` gym key. Gym presets and plateless save. Synthetic staples. | M | A floor or bar gym generates a real week; pull-ups hold PRs. |
| 5 | **Chains.** *Done 2026-11-12.* `chains.ts`, `suggestChain`, Move up / Move down in the logger, chain card ("Push 5/7 · Archer · 3×6"). | M–L | Hand-built bodyweight routines progress properly. Code is M; curating rungs is the L. |
| 6 | **Run days.** *Gated on slices 1–3 leaving a felt gap.* `routine_session` run fields, two tracks, hard-day line. | M | The hybrid plan, on top of real data. |
| 7 | **Later.** Shoes. A cron-triggered pull if the button gets tedious. Calisthenics generator template and profile. Rename decision. | S each | |

**Why this order.** Slice 1 first because the user's training today is
running, it is the smallest slice that makes running real, and it tests the
load-bearing bet. Slice 2 is cheap enough to do straight after, and the
decision whether to do it at all is made by using slice 1 for a couple of
weeks: if typing a run in is fine, skip it. Slice 3 is better over a backfilled
history than over a handful of typed runs, which is the one argument for not
skipping slice 2. Slice 0 before all of it because the suite is red and two
of the three fixes are one-line bugs that make the app lie about bodyweight
work right now.

**Risks the delegates flagged:**

- **`undefined` binds.** workerd's `bind` throws on `undefined`; `testdb.ts`
  coerces it to null and a test claims D1 accepts it. An outbox entry queued
  by an older build lacks the new fields, so without `?? null` at ingest it
  fails every drain and never leaves the phone. Make the test double throw
  like D1 does.
- **`INSERT OR REPLACE` erases unlisted columns** (`workouts.ts`). New
  workout fields must pass through `toPayload`, `HistoryWorkout`,
  `payloadFromEdits` and ingest together, or editing a run silently un-runs
  it. Needs a test.
- **Migration order.** Every push deploys, so additive migrations land before
  the code that needs them. `ALTER`s go in migrations only; `testdb.ts` runs
  schema then migrations and a duplicate column throws, and the new file must
  join its list.
- **Synthetic seed ids are referenced by routines.** Stable ids, upserts,
  `UPSERT_COLS` learns `requires_bar` in the same change. Never re-seed
  production destructively.
- **`DB_NAME` never changes.** `ActiveSession` changes are additive-optional
  only. The run form avoids `active_session` entirely.

## 7. Open questions

**Answered: what records your runs today?** A Garmin watch synced to Strava,
no Strava subscription, no appetite for an import workflow. Strava is out.
Garmin's new Personal API is a plain pull with a pasted key and is slice 2,
optional, decided after living with manual entry for a couple of weeks.

**Answered: the identity verdict in §1.** Keep Plated. The user's words:
focus on more important tasks right now.

**Still open: whether slice 2 happens at all.** The user's instinct is that
manual entry may be enough. The doc keeps the Garmin design so the decision
can be made with the facts in hand, not researched again.

## Council record

Round 1, proposal round, no scores (this was design, not a code review).

| Delegate | Identity | Run model | Chains | Hybrid week |
|---|---|---|---|---|
| Claude Opus 5.5 | Rename to SPLITS, keep Worker | workout + sets, `run_type`/`effort` | static module, rung = exercise_id | two tracks in one routine |
| Muse Wonder Full 1.0 | Keep Plated, revisit | workout + sets, `kind`/`run_type`/`rpe` | static module, rung = exercise_id | log only, run days later if felt |
| GPT-6.1 Sol | Keep Plated, reframe | `run` child table | versioned chains + JSON snapshots | dated plan layer |

Raw proposals are in the session scratchpad, not the repo.
