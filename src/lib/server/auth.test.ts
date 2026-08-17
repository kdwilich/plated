import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	authenticate,
	createSession,
	createUser,
	destroySession,
	hashPassword,
	resolveSession,
	verifyPassword
} from './auth.ts';
import { testDb } from './testdb.ts';

const PASSWORD = 'a-long-enough-password';

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
	assert.equal(Number(iters), 100_000);
});

test('the iteration count stays within what Workers will run', async () => {
	// Cloudflare refuses PBKDF2 above 100,000 outright, and `wrangler dev` does
	// not enforce the cap — so nothing but this test stands between a raised
	// constant and a 500 on every sign-in in production.
	const iters = Number((await hashPassword('x')).split('$')[2]);
	assert.ok(iters <= 100_000, `Workers caps PBKDF2 at 100000; got ${iters}`);
});

test('a hash written at a different iteration count still verifies', async () => {
	// The whole point of storing the count: raising it must not lock anyone out.
	const hash = await hashPassword('x');
	const parts = hash.split('$');
	const cheaper = await hashPassword('x'); // different salt, same count
	assert.notEqual(parts[3], cheaper.split('$')[3]);
	assert.ok(await verifyPassword('x', cheaper));
});

test('a malformed stored hash rejects rather than throws', async () => {
	assert.equal(await verifyPassword('x', 'garbage'), false);
	assert.equal(await verifyPassword('x', 'pbkdf2$sha256$notanumber$aa$bb'), false);
	assert.equal(await verifyPassword('x', 'bcrypt$sha256$600000$aa$bb'), false);
	assert.equal(await verifyPassword('x', ''), false);
});

test('a fresh session resolves to its user', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', PASSWORD);
	const token = await createSession(db, user!.id);
	assert.deepEqual(await resolveSession(db, token), { id: user!.id, email: 'a@example.com' });
});

test('an unknown token resolves to null', async () => {
	assert.equal(await resolveSession(testDb(), 'not-a-token'), null);
});

test('a missing token resolves to null', async () => {
	assert.equal(await resolveSession(testDb(), undefined), null);
});

test('the raw token is never stored', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', PASSWORD);
	const token = await createSession(db, user!.id);
	const row = await db.prepare('SELECT token_hash FROM session').first<{ token_hash: string }>();
	assert.notEqual(row!.token_hash, token);
});

test('an expired session resolves to null', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', PASSWORD);
	const token = await createSession(db, user!.id);
	await db
		.prepare('UPDATE session SET expires_at = ?')
		.bind(new Date(Date.now() - 1000).toISOString())
		.run();
	assert.equal(await resolveSession(db, token), null);
});

test('destroying a session revokes it', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', PASSWORD);
	const token = await createSession(db, user!.id);
	await destroySession(db, token);
	assert.equal(await resolveSession(db, token), null);
});

test('deleting a user revokes their sessions', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', PASSWORD);
	const token = await createSession(db, user!.id);
	await db.prepare('DELETE FROM user WHERE id = ?').bind(user!.id).run();
	assert.equal(await resolveSession(db, token), null);
});

test('a duplicate email is refused, case-insensitively', async () => {
	const db = testDb();
	assert.ok(await createUser(db, 'a@example.com', PASSWORD));
	assert.equal(await createUser(db, 'A@Example.COM', 'another-long-password'), null);
});

test('authenticate accepts the right password', async () => {
	const db = testDb();
	const user = await createUser(db, 'a@example.com', PASSWORD);
	assert.deepEqual(await authenticate(db, 'a@example.com', PASSWORD), {
		id: user!.id,
		email: 'a@example.com'
	});
});

test('authenticate rejects the wrong password', async () => {
	const db = testDb();
	await createUser(db, 'a@example.com', PASSWORD);
	assert.equal(await authenticate(db, 'a@example.com', 'wrong-password-here'), null);
});

test('authenticate rejects an unknown email', async () => {
	assert.equal(await authenticate(testDb(), 'nobody@example.com', PASSWORD), null);
});

test('sign-in is case-insensitive on email', async () => {
	// The UNIQUE index is NOCASE, so the lookup must be too or an account
	// becomes unreachable from the address its owner typed at signup.
	const db = testDb();
	await createUser(db, 'a@example.com', PASSWORD);
	assert.ok(await authenticate(db, 'A@Example.COM', PASSWORD));
});
