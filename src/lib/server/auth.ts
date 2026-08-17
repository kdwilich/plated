// Passwords and sessions. The only file here that touches WebCrypto, and the
// reason this project needs none of the usual authentication dependencies.

/**
 * The most Cloudflare Workers allows. Above this the platform refuses outright:
 *
 *   NotSupportedError: Pbkdf2 failed: iteration counts above 100000
 *   are not supported (requested 600000).
 *
 * OWASP asks 600,000 for PBKDF2-HMAC-SHA256, so this is below current guidance
 * and the ceiling is not ours to raise. `wrangler dev` does *not* enforce the
 * cap, so this only ever fails in production — which is exactly how it was
 * found. Do not raise this number expecting it to work.
 *
 * To exceed it the derivation has to be chained: N passes of 100,000, each
 * feeding the next. That costs N times the CPU, which is the real budget
 * question, so it is a deliberate decision rather than a constant to bump.
 * The stored hash carries its own iteration count, so any change applies to
 * new passwords without invalidating existing ones.
 */
const ITERATIONS = 100_000;

const b64 = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(
	password: string,
	salt: Uint8Array,
	iterations: number
): Promise<ArrayBuffer> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveBits']
	);
	return crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		256
	);
}

/** `pbkdf2$sha256$<iterations>$<salt>$<hash>` — self-describing on purpose, so
 *  the cost can be raised later without invalidating existing passwords. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const bits = await derive(password, salt, ITERATIONS);
	return `pbkdf2$sha256$${ITERATIONS}$${b64(salt.buffer as ArrayBuffer)}$${b64(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
	const iterations = Number(parts[2]);
	if (!Number.isInteger(iterations) || iterations < 1) return false;

	let expected: Uint8Array;
	let salt: Uint8Array;
	try {
		salt = unb64(parts[3]);
		expected = unb64(parts[4]);
	} catch {
		return false;
	}

	const actual = new Uint8Array(await derive(password, salt, iterations));
	if (actual.length !== expected.length) return false;
	// Constant time: returning early on the first differing byte leaks how much
	// of the hash a guess got right.
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
	return diff === 0;
}

export interface SessionUser {
	id: number;
	email: string;
}

/** Ninety days. This is a phone app used in a gym, and a session that expires
 *  between sets is the worst failure the app has. */
export const SESSION_DAYS = 90;
export const SESSION_COOKIE = 'session';

const sha256 = async (s: string): Promise<string> =>
	b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/**
 * Null when the email is already taken. The UNIQUE constraint is the check:
 * asking first would let two simultaneous signups both see the address free.
 */
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
	// Hash even when there is no such user, so a wrong address and a wrong
	// password cost the same and timing cannot enumerate accounts.
	const stored = row?.password_hash ?? (await hashPassword(password));
	const ok = await verifyPassword(password, stored);
	if (!row || !ok) return null;
	return { id: row.id, email: row.email };
}

export async function createSession(db: D1Database, userId: number): Promise<string> {
	const token = b64(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
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

export interface UserProfile {
	id: number;
	email: string;
	created_at: string;
}

export async function getUserProfile(db: D1Database, userId: number): Promise<UserProfile | null> {
	return db
		.prepare('SELECT id, email, created_at FROM user WHERE id = ?')
		.bind(userId)
		.first<UserProfile>();
}

/**
 * False when the current password is wrong. On success every *other* session is
 * revoked — changing a password because you fear it leaked should end the
 * sessions that leak might have created. `keepToken` is the caller's own
 * session, spared so that securing the account does not sign you out of the
 * device you are holding.
 *
 * There is no reset flow and no way to send email, so this is the only recovery
 * lever the app has.
 */
export async function changePassword(
	db: D1Database,
	userId: number,
	current: string,
	next: string,
	keepToken: string | undefined
): Promise<boolean> {
	const row = await db
		.prepare('SELECT password_hash FROM user WHERE id = ?')
		.bind(userId)
		.first<{ password_hash: string }>();
	if (!row || !(await verifyPassword(current, row.password_hash))) return false;

	const hash = await hashPassword(next);
	// An empty string never matches a real hash, so a missing token revokes all.
	const keep = keepToken ? await sha256(keepToken) : '';
	await db.batch([
		db.prepare('UPDATE user SET password_hash = ? WHERE id = ?').bind(hash, userId),
		db.prepare('DELETE FROM session WHERE user_id = ? AND token_hash != ?').bind(userId, keep)
	]);
	return true;
}
