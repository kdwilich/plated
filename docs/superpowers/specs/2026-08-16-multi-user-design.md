# Logins and multi-user

## Problem

Plateload has no authentication. `/api/sync` accepts a workout from anyone who
knows the URL, every query returns every row, and the gym is a single record
whose id — `'gym-default'` — is hardcoded in three places. The app cannot be
given to a second person, and it cannot be deployed publicly at all.

The schema anticipated this and then stopped: `user_id INTEGER NOT NULL DEFAULT
1` sits on `exercise`, `gym`, `routine`, and `workout`. Nothing reads it.
Nothing writes it. Grepping `src/` and `d1/` for `user_id` outside `schema.sql`
returns nothing. It is a marker of intent, not an implementation.

## What this is

Email-and-password accounts, open registration, server-side sessions, and
ownership scoping on every query that returns user data.

## Non-goals

Password reset and email verification both need outbound email, which the
project has no mechanism for. "Log out everywhere", account deletion, sharing
routines between users, and per-user custom exercises are all deferred. None of
them block a second person using the app.

## The catalog needs nothing

`is_custom` appears nowhere in `src/`. There is no create-your-own-exercise
feature, so all 1746 exercises are shared reference data and `catalog.ts` is
untouched by this work. The `exercise_fts` virtual table, which has no user
column and could not easily gain one, never has to distinguish owners.

If custom exercises arrive later, the scoping is a single predicate —
`WHERE is_custom = 0 OR user_id = ?` — added to the four catalog queries, and
`searchExercises` already joins `exercise` to `exercise_fts`, so even the search
path can be scoped without touching the FTS schema. That is why this is safe to
defer rather than merely convenient.

## Identity

Two new tables. No existing table changes.

```sql
CREATE TABLE user (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	password_hash TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE session (
	token_hash TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);
```

Sessions live in the database rather than in a signed stateless cookie, so
logging out revokes and a leaked cookie can be killed. The cost is one indexed
primary-key read per request, on routes that already talk to D1.

The database stores `SHA-256(token)`, never the token. A dump of `session` does
not let anyone log in.

### The first account inherits everything

`AUTOINCREMENT` issues id 1 first, and every existing row already reads
`user_id = 1`. So the first signup silently adopts the current routines,
workouts, and gym. This is convenient and it is also a trap: if a stranger signs
up before you do, they get your training history. **Sign up immediately after
the migration and before the app is reachable publicly.** The implementation
plan makes this a numbered step, not a footnote.

### Cookie

`session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7776000`

Ninety days, deliberately long. This is a phone PWA used in a gym; a session
that expires between sets is the worst failure the app has.

## Hashing, and the CPU budget

PBKDF2-SHA256 via WebCrypto — no new dependency, keeping the runtime dependency
list at one font. Stored as `pbkdf2$sha256$<iterations>$<salt_b64>$<hash_b64>`,
so the iteration count travels with the hash and can be raised later without
invalidating existing passwords. Verification compares in constant time.

Measured locally on Node 24: 600,000 iterations costs about 43 ms of CPU,
210,000 about 15 ms. The Workers **free** plan allows 10 ms of CPU per
invocation; the paid plan allows 30 s. Login and signup are the only routes that
would come close, and they are rare, but on the free plan no defensible
iteration count fits.

**This is an open item for the project owner.** The plan implements 600,000 —
the OWASP figure — and treats "confirm the Workers plan, or lower the constant"
as a decision to make before deploying, not before writing the code. workerd is
not Node, so the real number must be measured on the platform.

## The request boundary

`hooks.server.ts` resolves the session onto `event.locals.user` and then denies
by default:

```ts
if (!event.locals.user && !PUBLIC.has(event.route.id)) redirect(303, '/login');
```

`PUBLIC` holds `/login` and `/signup`, matched on `route.id` rather than a path
prefix so that a path cannot be crafted to satisfy it.

Deny-by-default is the point. Any route added later is protected without anyone
remembering to protect it, which is the failure mode that produces real leaks.

## Ownership

Every exported function in `gym.ts`, `routines.ts`, and `workouts.ts` gains a
`userId: number` parameter. **The type checker is the enforcement**: a call site
that forgets it does not compile.

This is why the `DEFAULT 1` on the four existing columns stays. Removing a
column default in SQLite requires rebuilding the table, and rebuilding four
tables that are referenced by foreign keys — one of them holding 1746 rows —
is more risk than the guarantee is worth when the compiler already provides a
stronger one.

Two patterns, and only two:

- **Owned tables** (`gym`, `routine`, `workout`): `WHERE id = ? AND user_id = ?`
  on reads, an explicit `user_id` on writes.
- **Child tables** (`routine_session`, `routine_exercise`, `gym_equipment`,
  `gym_plate`, `gym_bar`, `workout_set`): no column, no per-statement subquery.
  Ownership is established once per request by loading the parent, and a miss
  is a 404.

`/routines/[id]` has thirteen actions, each taking an id from a form. Thirteen
guards at the top of thirteen actions is fewer places to be wrong than forty
`WHERE ... IN (SELECT ...)` clauses, and it reads as what it is.

A by-id lookup that skips this returns another person's data. It is the only
part of this work where a bug is a breach rather than a defect.

## The gym singleton

`'gym-default'` is hardcoded as a default parameter in `gym.ts`, again in the
gym page's save action, and seven more times in `seed.sql`. It is a deeper
single-user assumption than the unused `user_id` columns.

`getGym(db, userId)` returns the user's own row. A new `bootstrapUser` creates
that row — plus standard plates, bars, and equipment — at signup, moving the
bootstrap out of `seed.sql`, where per-user data never belonged.

## Offline and sync

`/api/sync` derives the owner from the session and stamps `workout.user_id`
itself. **Nothing in the request body influences ownership.** Client-generated
UUIDs keep the POST idempotent, as now, but an id is no longer a claim.

The active session in IndexedDB records which user it belongs to. On boot, a
mismatch clears rather than resumes, so a shared phone does not hand one
person's workout to the next.

**The outbox must not discard a payload on 401.** A session can expire while the
device is offline; the sets logged in that window have to survive until the user
signs back in. Losing a completed workout to an authentication error is worse
than any error message. Logout warns when the outbox is non-empty.

## Testing

All 90 existing tests live under `src/lib/training/**` and touch no database.
Every ownership check described above could be inverted and the suite would
still pass. For the one feature where a defect leaks data, that is not enough.

`node:sqlite` ships with the project's Node 24 and has been verified to execute
`schema.sql` and prepared statements in memory. A shim of roughly sixty lines
over D1's `prepare`/`bind`/`first`/`all`/`run`/`batch` makes `src/lib/server/**`
testable under `node --test`, as a second test target.

The only obstacle is six `$lib/...` imports in those modules, which become
relative paths. `routines.ts` already imports `./catalog.ts` this way, so the
pattern is established rather than invented.

The test that matters, written once per exported function that takes a `userId`:
**user B gets null.** Plus a hashing round-trip, a wrong-password rejection, and
session expiry.

## Folded-in scope

`seed.sql` becomes catalog-only and re-runnable. This has been a known deferred
problem — 1746 plain `INSERT INTO exercise` statements that cannot be applied
twice — and it stops being deferrable here, because multi-user is the first
change that must actually reach a deployed database. Recorded as scope added on
purpose rather than discovered late.

## Migration

`d1/migrations/0001_multi_user.sql`, applied with
`wrangler d1 migrations apply`. The directory exists and is empty; wrangler
needs `migrations_dir = "d1/migrations"` on the D1 binding to find it.

The migration creates `user` and `session` and adds `user_id` indexes to `gym`,
`routine`, and `workout`. It alters no column and rebuilds no table, so it is
safe to apply to a database that already holds data.

## Risks

- **A missed ownership check.** Mitigated by the compiler-enforced parameter,
  the two-pattern rule, and the new server tests.
- **PBKDF2 against the free-plan CPU ceiling.** Open, see above.
- **The first-signup inheritance.** A sequencing hazard, mitigated by ordering
  in the plan.
- **Applying the migration to a remote database whose state is unverified.** The
  Worker has never been deployed, but a `--remote` D1 command may have run. The
  plan checks before it writes.
