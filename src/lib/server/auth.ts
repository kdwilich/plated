// Passwords and sessions. The only file here that touches WebCrypto, and the
// reason this project needs none of the usual authentication dependencies.

/**
 * OWASP's figure for PBKDF2-HMAC-SHA256. Measured at roughly 43 ms of CPU,
 * which fits a Workers *paid* plan comfortably and does not fit the free
 * plan's 10 ms budget. Lower it only as a deliberate, recorded decision.
 */
const ITERATIONS = 600_000;

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
