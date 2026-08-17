# Logins and Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give plateload email-and-password accounts and scope every query to its owner, so a second person can use the app without seeing the first person's data.

**Architecture:** Server-side sessions in D1, resolved once per request in `hooks.server.ts` onto `event.locals.user`, with a deny-by-default route guard. Every exported function in `gym.ts`, `routines.ts`, and `workouts.ts` gains a required `userId: number` parameter, so a route that forgets to pass one fails to compile. `catalog.ts` is untouched — the exercise catalog is shared reference data. A new `node:sqlite`-backed D1 shim makes the server modules testable so ownership can be asserted rather than assumed.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Cloudflare Workers, D1 (sqlite), WebCrypto (PBKDF2-SHA256), `node --test` with `node:sqlite`.

**Spec:** `docs/superpowers/specs/2026-08-16-multi-user-design.md`

---

## Ground rules for whoever executes this

- **The working directory is `/Volumes/home/docker/plateload`.** The shell resets
  to a different repo between commands. Every `Bash` call must `cd` explicitly.
- `npm run dev:wrangler` is `vite build && wrangler dev` and **does not watch**.
  Every source change needs the server stopped and restarted before it is live.
- Verification uses the in-app browser tools against real local D1. Click
  injection may time out because the Browser pane is hidden; driving the page's
  own handlers with `javascript_tool` still exercises `enhance` → server action →
  D1, and that limitation must be disclosed rather than papered over.
- Do not run `npm run deploy`. Deployment is the owner's decision and is
  explicitly out of scope for these tasks.

## File Structure

**New files**

| File | Responsibility |
| --- | --- |
| `d1/migrations/0001_multi_user.sql` | Creates `user` and `session`; adds `user_id` indexes. Alters no column, rebuilds no table. |
| `src/lib/server/auth.ts` | Password hashing and session lifecycle. The only file that touches WebCrypto. |
| `src/lib/server/auth.test.ts` | Hashing round-trip, wrong-password rejection, session create/resolve/expire. |
| `src/lib/server/testdb.ts` | D1-shaped shim over `node:sqlite`. Test-only; never imported by app code. |
| `src/lib/server/gym.test.ts` | Ownership assertions for `gym.ts`. |
| `src/lib/server/routines.test.ts` | Ownership assertions for `routines.ts`. |
| `src/lib/server/workouts.test.ts` | Ownership assertions for `workouts.ts`. |
| `src/hooks.server.ts` | Resolves the session onto `locals.user`; denies unauthenticated requests by default. |
| `src/routes/login/+page.svelte` / `+page.server.ts` | Sign in. |
| `src/routes/signup/+page.svelte` / `+page.server.ts` | Register, then bootstrap a gym. |
| `src/routes/logout/+server.ts` | POST-only sign out. |

**Modified**

| File | Change |
| --- | --- |
| `src/app.d.ts` | `App.Locals.user` |
| `wrangler.toml` | `migrations_dir` on the D1 binding |
| `package.json` | Second test target |
| `src/lib/server/gym.ts` | `userId` param; `bootstrapUser`; `'gym-default'` removed |
| `src/lib/server/routines.ts` | `userId` param on all 14 exported functions; `sessionScaffold` moved in |
| `src/lib/server/workouts.ts` | `userId` param on all 7 exported functions |
| `src/lib/client/session.ts` | `user_id` on `ActiveSession`; outbox stops on 401 |
| `src/routes/+layout.svelte` | Sign-out control; hide chrome on auth pages |
| 14 route files | Pass `locals.user.id` |
| `d1/seed.sql` | Catalog-only and re-runnable |

**Deliberately not modified:** `src/lib/server/catalog.ts`, `src/lib/training/**`.
The catalog is shared; the training core is pure. If a task seems to require
editing either, stop and re-read the spec.

---

### Task 1: Make the server layer testable

Nothing else in this plan can be verified without this. Do it first.

**Files:**
- Create: `src/lib/server/testdb.ts`
- Modify: `src/lib/server/catalog.ts:1-3`, `src/lib/server/gym.ts:1`, `src/lib/server/routines.ts:1-2`, `src/lib/server/workouts.ts:1`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Replace `$lib` imports in the server modules with relative paths**

`node --test` strips types but does not resolve SvelteKit's `$lib` alias. Six
imports block it. `routines.ts` already imports `./catalog.ts` with an explicit
extension, so follow that form exactly.

```
src/lib/server/catalog.ts:1   '$lib/training/types'      -> '../training/types.ts'
src/lib/server/catalog.ts:2   '$lib/training/filters'    -> '../training/filters.ts'
src/lib/server/catalog.ts:3   '$lib/training/volume'     -> '../training/volume.ts'
src/lib/server/gym.ts:1       '$lib/training/types'      -> '../training/types.ts'
src/lib/server/routines.ts:1  '$lib/training/types'      -> '../training/types.ts'
src/lib/server/routines.ts:2  '$lib/training/profiles'   -> '../training/profiles.ts'
src/lib/server/workouts.ts:1  '$lib/training/types'      -> '../training/types.ts'
```

- [ ] **Step 2: Verify nothing broke**

```bash
cd /Volumes/home/docker/plateload && npm run check
```

Expected: 0 errors, 0 warnings, same file count as before.

- [ ] **Step 3: Write the D1 shim**

Create `src/lib/server/testdb.ts`. Four facts established by probing, all of
which the shim must handle:

- `d1/schema.sql` executes wholesale under `node:sqlite`, FTS5 included.
- Foreign keys are **off** by default; D1 enforces them, so turn them on or
  cascade-delete tests will silently pass while the real thing fails.
- Booleans cannot be bound (`Provided value cannot be bound to SQLite
  parameter N`). D1 accepts them and stores 0/1, so the shim must coerce.
- `node:sqlite` prints an experimental warning; harmless.

```ts
// A D1-shaped façade over node:sqlite, so the server modules can be tested
// without a Worker. Test-only — app code must never import this.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

type Arg = string | number | bigint | null | Uint8Array;

/** D1 takes booleans and stores 0/1; node:sqlite refuses them outright. */
function coerce(v: unknown): Arg {
	if (typeof v === 'boolean') return v ? 1 : 0;
	if (v === undefined) return null;
	return v as Arg;
}

class Stmt {
	constructor(
		private db: DatabaseSync,
		private sql: string,
		private args: Arg[] = []
	) {}
	bind(...args: unknown[]): Stmt {
		return new Stmt(this.db, this.sql, args.map(coerce));
	}
	async first<T = Record<string, unknown>>(): Promise<T | null> {
		return (this.db.prepare(this.sql).get(...this.args) as T) ?? null;
	}
	async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
		return { results: this.db.prepare(this.sql).all(...this.args) as T[] };
	}
	async run(): Promise<void> {
		this.db.prepare(this.sql).run(...this.args);
	}
}

/** An empty database with the real schema and the migration applied. */
export function testDb(): D1Database {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(readFileSync('d1/schema.sql', 'utf8'));
	db.exec(readFileSync('d1/migrations/0001_multi_user.sql', 'utf8'));
	return {
		prepare: (sql: string) => new Stmt(db, sql),
		// D1's batch is the transaction. Sequential is honest enough for tests:
		// what these tests assert is ownership, not atomicity under failure.
		batch: async (stmts: Stmt[]) => {
			for (const s of stmts) await s.run();
			return [];
		}
	} as unknown as D1Database;
}
```

- [ ] **Step 4: Add the second test target**

`package.json`, replacing the existing `test` script:

```json
"test": "npm run test:training && npm run test:server",
"test:training": "node --test \"src/lib/training/**/*.test.ts\"",
"test:server": "node --test --no-warnings \"src/lib/server/**/*.test.ts\""
```

`--no-warnings` suppresses the `node:sqlite` experimental notice so a real
failure is not buried.

- [ ] **Step 5: Prove the harness works before trusting it**

Write a temporary `src/lib/server/testdb.test.ts` that opens a `testDb()`,
inserts a `gym` row with a boolean `is_default` on a bar, reads it back, and
asserts a cascade delete removes the bar.

```bash
cd /Volumes/home/docker/plateload && npm test
```

Expected: 90 training tests pass, plus the new ones. If `0001_multi_user.sql`
does not exist yet, do Task 2 first and return here.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "test: make the server modules testable against node:sqlite"
```

---

### Task 2: The migration

**Files:**
- Create: `d1/migrations/0001_multi_user.sql`
- Modify: `wrangler.toml`

- [ ] **Step 1: Check what the remote database actually contains**

The Worker has never been deployed, but a `--remote` D1 command may have run.
Find out before writing anything to it.

```bash
cd /Volumes/home/docker/plateload && npx wrangler d1 execute plateload-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Record the result in the task notes. If it errors or returns nothing, the remote
database is empty and the deploy path is clean. **Do not run any remote write
in this task** — remote application is the owner's call, in Task 14.

- [ ] **Step 2: Point wrangler at the migrations directory**

`d1/migrations/` exists and is empty; wrangler defaults to `./migrations`. In
`wrangler.toml`, under the existing `[[d1_databases]]` block:

```toml
migrations_dir = "d1/migrations"
```

- [ ] **Step 3: Write the migration**

```sql
-- Accounts. Everything before this belongs to user 1 by column default, so the
-- first signup adopts the existing data — see the plan's Task 14.
CREATE TABLE IF NOT EXISTS user (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	password_hash TEXT NOT NULL,
	created_at TEXT NOT NULL
);

-- The cookie's value is never stored, only its SHA-256. A dump of this table
-- does not let anyone sign in.
CREATE TABLE IF NOT EXISTS session (
	token_hash TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_user ON session (user_id);
CREATE INDEX IF NOT EXISTS idx_gym_user ON gym (user_id);
CREATE INDEX IF NOT EXISTS idx_routine_user ON routine (user_id, is_active DESC);
CREATE INDEX IF NOT EXISTS idx_workout_user ON workout (user_id, started_at DESC);
```

- [ ] **Step 4: Apply locally and confirm**

```bash
cd /Volumes/home/docker/plateload && npx wrangler d1 migrations apply plateload-db --local
```

Expected: one migration applied. Then:

```bash
cd /Volumes/home/docker/plateload && npx wrangler d1 execute plateload-db --local --command "SELECT COUNT(*) AS routines FROM routine; SELECT name FROM sqlite_master WHERE name IN ('user','session')"
```

Expected: the existing routine count is unchanged, and both tables exist. A
migration that alters no column cannot lose data, and this proves it.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(db): add user and session tables"
```

---

### Task 3: Password hashing

**Files:**
- Create: `src/lib/server/auth.ts`
- Create: `src/lib/server/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './auth.ts';

test('a hash verifies against its own password', async () => {
	const hash = await hashPassword('correct horse battery staple');
	assert.ok(await verifyPassword('correct horse battery staple', hash));
});

test('a hash rejects the wrong password', async () => {
	const hash = await hashPassword('correct horse battery staple');
	assert.equal(await verifyPassword('Correct horse battery staple', hash), false);
});

test('the same password hashes differently every time', async () => {
	// A shared salt would let one rainbow table cover every account.
	assert.notEqual(await hashPassword('same'), await hashPassword('same'));
});

test('the iteration count travels with the hash', async () => {
	// So it can be raised later without invalidating anyone's password.
	const [scheme, algo, iters] = (await hashPassword('x')).split('$');
	assert.equal(scheme, 'pbkdf2');
	assert.equal(algo, 'sha256');
	assert.ok(Number(iters) >= 600000);
});

test('a malformed stored hash rejects rather than throws', async () => {
	assert.equal(await verifyPassword('x', 'garbage'), false);
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /Volumes/home/docker/plateload && npm run test:server
```

Expected: FAIL, `Cannot find module './auth.ts'`.

- [ ] **Step 3: Implement**

```ts
// Passwords and sessions. The only file here that touches WebCrypto, and the
// only reason this project needs none of the usual auth dependencies.

const ITERATIONS = 600_000; // OWASP's figure for PBKDF2-HMAC-SHA256.

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	return crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		key,
		256
	);
}

/** `pbkdf2$sha256$<iterations>$<salt>$<hash>` — self-describing on purpose. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const bits = await derive(password, salt, ITERATIONS);
	return `pbkdf2$sha256$${ITERATIONS}$${b64(salt.buffer)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
	const iterations = Number(parts[2]);
	if (!Number.isFinite(iterations) || iterations < 1) return false;
	let expected: Uint8Array;
	try {
		expected = unb64(parts[4]);
	} catch {
		return false;
	}
	const actual = new Uint8Array(await derive(password, unb64(parts[3]), iterations));
	if (actual.length !== expected.length) return false;
	// Constant time: a length-independent early return leaks the prefix.
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
	return diff === 0;
}
```

- [ ] **Step 4: Run the tests**

```bash
cd /Volumes/home/docker/plateload && npm run test:server
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(auth): hash and verify passwords with PBKDF2"
```

---

### Task 4: Sessions

**Files:**
- Modify: `src/lib/server/auth.ts`
- Modify: `src/lib/server/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { testDb } from './testdb.ts';
import { createSession, resolveSession, destroySession, createUser } from './auth.ts';

test('a fresh session resolves to its user', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', 'a-long-enough-password');
	const token = await createSession(db, user.id);
	assert.deepEqual(await resolveSession(db, token), { id: user.id, email: 'a@example.com' });
});

test('an unknown token resolves to null', async () => {
	assert.equal(await resolveSession(testDb(), 'not-a-token'), null);
});

test('a missing token resolves to null without touching the database', async () => {
	assert.equal(await resolveSession(testDb(), undefined), null);
});

test('the raw token is never stored', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', 'a-long-enough-password');
	const token = await createSession(db, user.id);
	const row = await db.prepare('SELECT token_hash FROM session').first<{ token_hash: string }>();
	assert.notEqual(row!.token_hash, token);
});

test('an expired session resolves to null', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', 'a-long-enough-password');
	const token = await createSession(db, user.id);
	await db
		.prepare('UPDATE session SET expires_at = ?')
		.bind(new Date(Date.now() - 1000).toISOString())
		.run();
	assert.equal(await resolveSession(db, token), null);
});

test('destroying a session revokes it', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', 'a-long-enough-password');
	const token = await createSession(db, user.id);
	await destroySession(db, token);
	assert.equal(await resolveSession(db, token), null);
});

test('a duplicate email is refused, case-insensitively', async () => {
	const db = testDb();
	await createUser(db, 'a@example.com', 'a-long-enough-password');
	assert.equal(await createUser(db, 'A@Example.COM', 'another-long-password'), null);
});
```

- [ ] **Step 2: Run and watch them fail**

```bash
cd /Volumes/home/docker/plateload && npm run test:server
```

- [ ] **Step 3: Implement**

Append to `src/lib/server/auth.ts`:

```ts
export interface SessionUser {
	id: number;
	email: string;
}

/** Ninety days. This is a phone app used in a gym; a session that expires
 *  between sets is the worst failure mode the app has. */
export const SESSION_DAYS = 90;
export const SESSION_COOKIE = 'session';

async function sha256(s: string): Promise<string> {
	return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/** Null when the email is taken. The UNIQUE constraint is the check — asking
 *  first would race two simultaneous signups. */
export async function createUser(
	db: D1Database,
	email: string,
	password: string
): Promise<SessionUser | null> {
	const hash = await hashPassword(password);
	try {
		const row = await db
			.prepare(
				'INSERT INTO user (email, password_hash, created_at) VALUES (?, ?, ?) RETURNING id, email'
			)
			.bind(email.trim(), hash, new Date().toISOString())
			.first<{ id: number; email: string }>();
		return row ? { id: row.id, email: row.email } : null;
	} catch {
		return null;
	}
}

export async function authenticate(
	db: D1Database,
	email: string,
	password: string
): Promise<SessionUser | null> {
	const row = await db
		.prepare('SELECT id, email, password_hash FROM user WHERE email = ?')
		.bind(email.trim())
		.first<{ id: number; email: string; password_hash: string }>();
	// Hash anyway when the row is missing, so a wrong email and a wrong
	// password take the same time and the response cannot enumerate accounts.
	const stored = row?.password_hash ?? (await hashPassword('placeholder'));
	if (!(await verifyPassword(password, stored)) || !row) return null;
	return { id: row.id, email: row.email };
}

export async function createSession(db: D1Database, userId: number): Promise<string> {
	const token = b64(crypto.getRandomValues(new Uint8Array(32)).buffer);
	const now = new Date();
	const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
	await db
		.prepare(
			'INSERT INTO session (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
		)
		.bind(await sha256(token), userId, now.toISOString(), expires.toISOString())
		.run();
	return token;
}

export async function resolveSession(
	db: D1Database,
	token: string | undefined
): Promise<SessionUser | null> {
	if (!token) return null;
	const row = await db
		.prepare(
			`SELECT u.id, u.email FROM session s JOIN user u ON u.id = s.user_id
			 WHERE s.token_hash = ? AND s.expires_at > ?`
		)
		.bind(await sha256(token), new Date().toISOString())
		.first<{ id: number; email: string }>();
	return row ? { id: row.id, email: row.email } : null;
}

export async function destroySession(db: D1Database, token: string | undefined): Promise<void> {
	if (!token) return;
	await db.prepare('DELETE FROM session WHERE token_hash = ?').bind(await sha256(token)).run();
}
```

- [ ] **Step 4: Run the tests**

```bash
cd /Volumes/home/docker/plateload && npm run test:server
```

Expected: 12 pass. These are slow — each `createUser` runs 600k PBKDF2
iterations. If the suite exceeds ~30s, that is a signal worth recording for
Task 14's plan decision, not a reason to lower the constant here.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(auth): server-side sessions"
```

---

### Task 5: The request boundary

**Files:**
- Create: `src/hooks.server.ts`
- Modify: `src/app.d.ts`

- [ ] **Step 1: Declare the local**

In `src/app.d.ts`, inside `namespace App`:

```ts
interface Locals {
	user: import('$lib/server/auth').SessionUser | null;
}
```

- [ ] **Step 2: Write the hook**

```ts
// Every request resolves its user once, here. Routes read `locals.user` and
// never look at cookies.
import { redirect, type Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { resolveSession, SESSION_COOKIE } from '$lib/server/auth';

// Matched on route id, not a path prefix: a prefix test can be satisfied by a
// crafted path, and a route id cannot.
const PUBLIC = new Set(['/login', '/signup']);

export const handle: Handle = async ({ event, resolve }) => {
	const db = getDb(event.platform);
	event.locals.user = await resolveSession(db, event.cookies.get(SESSION_COOKIE));

	if (!event.locals.user && event.route.id && !PUBLIC.has(event.route.id)) {
		// Deny by default. A route added a year from now is protected without
		// anyone remembering to protect it — which is the failure that leaks.
		if (event.request.method !== 'GET') return new Response('Unauthorized', { status: 401 });
		redirect(303, `/login?next=${encodeURIComponent(event.url.pathname)}`);
	}

	return resolve(event);
};
```

The method split matters: `/api/sync` is a POST from a background drain, and
redirecting it to an HTML login page would make the client parse a page as JSON.
A 401 is what the outbox is built to survive.

- [ ] **Step 3: Verify the app now refuses anonymous requests**

```bash
cd /Volumes/home/docker/plateload && npm run build
```

Expected: builds clean. Then start `dev:wrangler`, and with no session cookie:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:8787/
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8787/api/sync -d '{}'
```

Expected: `303 .../login?next=%2F` and `401`. **This is the single most
important verification in the plan** — everything downstream assumes it holds.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(auth): resolve the session per request and deny by default"
```

---

### Task 6: Sign up, sign in, sign out

**Files:**
- Create: `src/routes/login/+page.server.ts`, `src/routes/login/+page.svelte`
- Create: `src/routes/signup/+page.server.ts`, `src/routes/signup/+page.svelte`
- Create: `src/routes/logout/+server.ts`
- Modify: `src/lib/server/gym.ts` (add `bootstrapUser`)
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Write `bootstrapUser` in `gym.ts`**

The seven `gym-default` rows in `seed.sql` become this. Called once, at signup.

```ts
/** A new account's starting gym. This used to live in seed.sql, where per-user
 *  data never belonged. */
export async function bootstrapUser(db: D1Database, userId: number): Promise<void> {
	const id = `gym-${crypto.randomUUID()}`;
	await saveGym(db, userId, {
		id,
		name: 'My gym',
		dumbbell_step_lb: 5,
		machine_step_lb: 10,
		equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'body only', 'e-z curl bar', 'kettlebells'],
		plates: [45, 35, 25, 10, 5, 2.5].map((d) => ({ denomination_lb: d, pairs: d >= 25 ? 10 : 4 })),
		bars: [
			{ id: `bar-straight-${id}`, name: 'Straight bar', weight_lb: 45, is_default: true },
			{ id: `bar-ez-${id}`, name: 'EZ curl', weight_lb: 25, is_default: false }
		]
	});
}
```

Bar ids are suffixed with the gym id because they were previously derived from
the bar's name alone — `bar-straight-bar` for everyone — which collides on a
shared `gym_bar` primary key the moment there are two accounts. Do not skip this.

- [ ] **Step 2: Signup action**

Open registration, per the design decision. Validate: email contains `@`,
password at least 10 characters. On success create the user, bootstrap the gym,
create a session, set the cookie, redirect to `/`.

```ts
const cookieOpts = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax' as const,
	maxAge: SESSION_DAYS * 86_400
};
```

`secure: !dev` because `wrangler dev` serves plain HTTP on localhost and a
`Secure` cookie would be silently dropped there — the whole flow would appear
to succeed and never log anyone in.

- [ ] **Step 3: Login action**

`authenticate`, then session, cookie, and redirect to `?next=` if it is a
same-origin absolute path (starts with `/` and not `//`), else `/`. **Never
redirect to an arbitrary `next`** — that is an open redirect.

On failure: one message, `Email or password is wrong.` Never distinguish which.

- [ ] **Step 4: Logout**

`src/routes/logout/+server.ts`, POST only, so a prefetched or embedded GET
cannot sign the user out. `destroySession`, delete the cookie, redirect to
`/login`.

- [ ] **Step 5: The pages**

Match the existing SCSS token vocabulary — `$signal`, `$surface-raised`,
`$hairline`, `$space-*`, `$tap-target`, `$radius`. Inputs must be at least
`$tap-target` tall and use `type="email"` / `type="password"` with
`autocomplete="email"` and `autocomplete="current-password"` /
`"new-password"`, so password managers work.

In `+layout.svelte`, hide the bottom tab bar when `page.data.user` is null —
a nav bar on the login screen leads nowhere. Add sign-out to `/gym`, the
settings-shaped page, rather than adding a fifth tab.

Add a root `+layout.server.ts` returning `{ user: locals.user }` so the layout
can see it.

- [ ] **Step 6: Verify the round trip**

Restart `dev:wrangler`. In the browser: `/signup` → create an account → land on
`/` → confirm the tab bar is back → sign out → confirm `/` redirects to
`/login` → sign in again → confirm you are back.

Then confirm the cookie is right:

```bash
curl -si -X POST http://localhost:8787/login -d 'email=...&password=...' | grep -i set-cookie
```

Expected: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=7776000`.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(auth): sign up, sign in, sign out"
```

---

### Task 7: Scope `gym.ts`

From here the pattern repeats. **Write the ownership test first, every time.**
The test is the only thing standing between a typo and a data leak.

**Files:**
- Modify: `src/lib/server/gym.ts`
- Create: `src/lib/server/gym.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test("a user's gym is their own", async () => {
	const db = testDb();
	await bootstrapUser(db, 1);
	await bootstrapUser(db, 2);
	const a = await getGym(db, 1);
	const b = await getGym(db, 2);
	assert.notEqual(a.id, b.id);
});

test('saving a gym cannot overwrite another user\'s', async () => {
	const db = testDb();
	await bootstrapUser(db, 1);
	await bootstrapUser(db, 2);
	const victim = await getGym(db, 1);
	await saveGym(db, 2, { ...victim, name: 'Stolen' });
	assert.notEqual((await getGym(db, 1)).name, 'Stolen');
});

test('a user with no gym gets one rather than an error', async () => {
	const db = testDb();
	const gym = await getGym(db, 9);
	assert.ok(gym.id);
	assert.equal(gym.bars.length > 0, true);
});
```

That last one matters because `getGym` currently assumes the row exists —
`seed.sql` guaranteed it. Nothing guarantees it now.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

- `getGym(db, userId)` — `SELECT * FROM gym WHERE user_id = ? LIMIT 1`, creating
  one via `bootstrapUser` if absent. The `id = 'gym-default'` default parameter
  is deleted.
- `saveGym(db, userId, gym)` — the `INSERT OR REPLACE` becomes an insert with
  `user_id`, plus a guard: if a row with that id exists under a different
  `user_id`, refuse. `INSERT OR REPLACE` on a caller-supplied id is how one
  account overwrites another's gym.

- [ ] **Step 4: Run the tests. Expected: pass.**

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(gym): scope gyms to their owner"
```

---

### Task 8: Scope `workouts.ts`

**Files:**
- Modify: `src/lib/server/workouts.ts`
- Create: `src/lib/server/workouts.test.ts`

Seven exported functions: `ingestWorkout`, `lastPerformances`, `deleteWorkout`,
`recentWorkouts`, `workoutDetail`, `lastCompletedPosition`,
`recentTrainedMuscles`.

- [ ] **Step 1: Write the failing tests — one per function**

The shape, repeated:

```ts
test('workoutDetail refuses another user\'s workout', async () => {
	const db = testDb();
	await ingestWorkout(db, 1, payload('w1'));
	assert.equal((await workoutDetail(db, 2, 'w1')).workout, null);
});

test('deleteWorkout cannot delete another user\'s workout', async () => {
	const db = testDb();
	await ingestWorkout(db, 1, payload('w1'));
	await deleteWorkout(db, 2, 'w1');
	assert.ok((await workoutDetail(db, 1, 'w1')).workout);
});

test('lastPerformances does not leak another user\'s sets', async () => {
	const db = testDb();
	await ingestWorkout(db, 1, payload('w1', [{ exercise_id: 'ex1', weight_lb: 315 }]));
	assert.deepEqual(await lastPerformances(db, 2, ['ex1']), {});
});
```

`lastPerformances` is the sharpest of these: it drives "last time you did this",
so an unscoped version silently seeds one person's working weights from
another's. That is a wrong barbell load, not just a privacy defect.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

`workout` carries `user_id`. `workout_set` does not, and does not need to — every
query already joins through `workout`, so each gains `AND w.user_id = ?`.
`ingestWorkout` stamps `user_id` from its parameter and **ignores anything in
the payload**.

- [ ] **Step 4: Run the tests. Expected: pass.**

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(history): scope workouts to their owner"
```

---

### Task 9: Scope `routines.ts`

The largest surface: fourteen exported functions, and the one page with thirteen
form actions taking ids.

**Files:**
- Modify: `src/lib/server/routines.ts`
- Create: `src/lib/server/routines.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover, at minimum: `getRoutine`, `getActiveRoutine`, `listRoutines`,
`activateRoutine`, `deleteRoutine`, `duplicateRoutine`, `addRoutineSession`,
`renameRoutine`, `saveRoutineFromDraft`.

```ts
test('listRoutines shows only your own', async () => {
	const db = testDb();
	await createRoutine(db, 1, 'Mine', 'hypertrophy', null);
	await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	assert.deepEqual((await listRoutines(db, 1)).map((r) => r.name), ['Mine']);
});

test('activating another user\'s routine does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await activateRoutine(db, 1, theirs);
	assert.equal((await listRoutines(db, 2))[0].is_active, false);
});

test('deleting another user\'s routine does nothing', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await deleteRoutine(db, 1, theirs);
	assert.equal(await getRoutine(db, 2, theirs) !== null, true);
});

test('deleting your active routine promotes your own survivor, not theirs', async () => {
	// The existing promote-a-survivor logic picks the newest routine in the
	// table. Unscoped, it hands you someone else's.
	const db = testDb();
	const mine = await createRoutine(db, 1, 'Mine', 'hypertrophy', null);
	await activateRoutine(db, 1, mine);
	await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	await deleteRoutine(db, 1, mine);
	assert.equal(await getActiveRoutine(db, 1), null);
});
```

That last test is a real bug this task must fix, not a hypothetical:
`deleteRoutine` currently runs `SELECT id FROM routine ORDER BY created_at DESC
LIMIT 1` with no filter.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

- Owned reads: `WHERE id = ? AND user_id = ?`.
- `createRoutine` and `saveRoutineFromDraft` write `user_id`.
- `activateRoutine`'s deactivate-others batch becomes
  `UPDATE routine SET is_active = 0 WHERE is_active = 1 AND user_id = ?` —
  unscoped, signing in and picking a routine deactivates everyone's.
- Child mutations (`addRoutineSession`, `renameRoutineSession`,
  `deleteRoutineSession`, `moveRoutineSession`, `addRoutineExercise`, and the
  per-exercise edit/swap/remove) take the routine id and verify ownership once,
  rather than each growing a subquery.

- [ ] **Step 4: Run the tests. Expected: pass.**

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(routines): scope routines to their owner"
```

---

### Task 10: The session-start query

`src/routes/api/session-start/+server.ts` is the only place outside
`src/lib/server/` that writes raw SQL, and it reads `routine_session` and
`routine_exercise` by id with no ownership check at all.

**Files:**
- Modify: `src/lib/server/routines.ts`
- Modify: `src/routes/api/session-start/+server.ts`
- Modify: `src/lib/server/routines.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('a session scaffold is refused for another user\'s day', async () => {
	const db = testDb();
	const theirs = await createRoutine(db, 2, 'Theirs', 'hypertrophy', null);
	const day = await addRoutineSession(db, 2, theirs, 'Push');
	assert.equal(await sessionScaffold(db, 1, day), null);
});
```

- [ ] **Step 2: Run and watch it fail**

- [ ] **Step 3: Move the query into `routines.ts` as `sessionScaffold(db, userId, sessionId)`**

Joining up to `routine` for the ownership check:

```sql
FROM routine_exercise re
JOIN exercise e ON e.id = re.exercise_id
JOIN routine_session rs ON rs.id = re.session_id
JOIN routine r ON r.id = rs.routine_id
WHERE re.session_id = ? AND r.user_id = ?
ORDER BY re.position
```

The route keeps the increment and bar-weight arithmetic — that is its job — and
returns 404 when `sessionScaffold` returns null.

- [ ] **Step 4: Run the tests. Expected: pass.**

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(workout): scope the session scaffold to its owner"
```

---

### Task 11: Thread the user through every route

Mechanical, and the compiler drives it. After Tasks 7–10 the project will not
build; this task is finished when it does.

**Files (all 14):**

```
src/routes/+page.server.ts               getActiveRoutine, lastCompletedPosition, recentTrainedMuscles
src/routes/gym/+page.server.ts           getGym, saveGym  (+ delete the 'gym-default' literal)
src/routes/history/+page.server.ts       recentWorkouts, deleteWorkout
src/routes/history/[id]/+page.server.ts  workoutDetail
src/routes/exercises/[id]/+page.server.ts lastPerformances
src/routes/routines/+page.server.ts      listRoutines, createRoutine, activateRoutine, getGym
src/routes/routines/[id]/+page.server.ts all 13 actions + load
src/routes/routines/generate/+page.server.ts  getGym, saveRoutineFromDraft
src/routes/api/sync/+server.ts           ingestWorkout
src/routes/api/session-start/+server.ts  getGym, lastPerformances, sessionScaffold
src/routes/api/recommend/+server.ts      getGym
src/routes/api/exercise-context/+server.ts  getGym, lastPerformances
src/routes/exercises/+page.server.ts     no change (catalog is shared)
src/routes/api/search/+server.ts         no change (catalog is shared)
```

- [ ] **Step 1: Add `locals` to each signature and pass `locals.user!.id`**

The `!` is honest here: `hooks.server.ts` guarantees a user on every non-public
route, and these routes are not public. Add it once per file with a short
comment, not a defensive branch that can never be taken.

- [ ] **Step 2: In `/routines/[id]`, guard once per action**

`load` already 404s a missing routine; with scoping it 404s another user's too.
Each action re-verifies the routine before mutating, because an action is
reachable without the load having run.

- [ ] **Step 3: Build until clean**

```bash
cd /Volumes/home/docker/plateload && npm run check
```

Expected: 0 errors. A remaining error is a call site that would have leaked —
read it before silencing it.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(auth): pass the signed-in user to every query"
```

---

### Task 12: The offline client

**Files:**
- Modify: `src/lib/client/session.ts`
- Modify: `src/routes/workout/+page.svelte`, `src/routes/+layout.svelte`

- [ ] **Step 1: Stamp the user on the active session**

Add `user_id: number` to `ActiveSession`. `/api/session-start` returns it. On
boot, `loadActive()` compares it to the signed-in user and clears rather than
resumes on a mismatch — a shared phone must not hand one person's workout to the
next. Sessions stored before this field existed have `undefined`; treat that as
belonging to the current user, matching how `movement_pattern` was handled.

- [ ] **Step 2: Stop the drain on 401**

`drainOutbox` already only deletes on `res.ok`, so **no data is lost today** —
but it retries every entry against a dead session and reports them as merely
pending.

```ts
if (res.status === 401) break; // signed out; these keep until sign-in
```

Then drain again after a successful sign-in, not only on `online`.

- [ ] **Step 3: Warn before signing out with unsynced work**

Expose `outboxCount()` and confirm before logout when it is non-zero.

- [ ] **Step 4: Verify by hand**

Start a workout, log a set, sign out, sign in as a second account. Expected: the
second account sees no active session and an empty history, and the first
account's workout is still there when they sign back in.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "feat(sync): keep the offline session and outbox with their owner"
```

---

### Task 13: Make `seed.sql` re-runnable

**Files:**
- Modify: `d1/seed.sql`, `scripts/seed-exercises.mjs`

- [ ] **Step 1: Catalog only**

Delete the seven `gym-default` rows (lines ~4683–4690); `bootstrapUser` owns
that now.

- [ ] **Step 2: `INSERT OR REPLACE`**

The 1746 `INSERT INTO exercise` statements become `INSERT OR REPLACE INTO
exercise`, generated that way by `scripts/seed-exercises.mjs`. This is the
deferred problem that has blocked corrected `movement_pattern` values from
reaching a real database.

- [ ] **Step 3: Prove it twice**

```bash
cd /Volumes/home/docker/plateload && npm run seed && npx wrangler d1 execute plateload-db --local --file d1/seed.sql && npx wrangler d1 execute plateload-db --local --file d1/seed.sql && npx wrangler d1 execute plateload-db --local --command "SELECT COUNT(*) FROM exercise"
```

Expected: applying it twice succeeds, and the count is 1746 both times — not
3492, and not an error.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/home/docker/plateload && git add -A && git commit -m "fix(seed): make the catalog seed re-runnable"
```

---

### Task 14: Verify, and hand the deploy decision back

- [ ] **Step 1: The full suite**

```bash
cd /Volumes/home/docker/plateload && npm run check && npm test
```

Expected: 0 errors, 0 warnings; 90 training tests plus the new server tests, all
passing. Report the real numbers — not "tests pass".

- [ ] **Step 2: Two accounts, by hand, in the browser**

Restart `dev:wrangler`. As account A: create a routine, run a workout, log sets,
finish, confirm history. As account B: confirm an empty library, an empty
history, a bootstrapped gym of their own, and that A's routine id typed directly
into `/routines/<id>` returns 404 rather than the routine.

- [ ] **Step 3: Probe the endpoints directly, without a cookie**

```bash
for p in / /routines /history /gym /api/session-start /api/sync; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8787$p"
done
```

Expected: 303 or 401 on every one. Anything returning 200 is a hole.

- [ ] **Step 4: Measure PBKDF2 on the real platform**

The spec leaves this open. On workerd, not Node:

```bash
cd /Volumes/home/docker/plateload && curl -s -o /dev/null -w "login wall time: %{time_total}s\n" -X POST http://localhost:8787/login -d 'email=...&password=...'
```

Wall time is not CPU time, but a login above roughly 200 ms means the 600k
constant will not fit a Workers **free** plan's 10 ms CPU budget. Report the
number and the choice — raise the plan, or lower `ITERATIONS` — to the owner.
**Do not silently lower it.**

- [ ] **Step 5: Merge**

Match the project's habit: `--ff-only` into `main`, no PR, delete the branch.

```bash
cd /Volumes/home/docker/plateload && git checkout main && git merge --ff-only multi-user && git push && git branch -d multi-user
```

- [ ] **Step 6: Stop, and hand these to the owner**

Do not run `npm run deploy`. Present, in one message:

1. The measured login cost and the Workers plan question.
2. What Task 2 found in the remote database.
3. **The first-signup hazard, stated plainly:** the remote database's existing
   rows all read `user_id = 1`, and the first account created will be id 1 and
   will inherit them. Whoever deploys must apply the migration and sign up
   before the URL is shared with anyone. Getting this wrong hands a stranger the
   owner's entire training history, and it is not recoverable through the UI.
