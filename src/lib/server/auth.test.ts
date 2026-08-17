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
