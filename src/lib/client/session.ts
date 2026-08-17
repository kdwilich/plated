// The active workout lives here, in IndexedDB, and never needs the network.
// Finished sessions move to an outbox; the outbox drains on finish, on
// regained connectivity, and on every app launch. All ids are client UUIDs,
// so a retried POST is idempotent server-side.

import type { LoggedSet, MovementPattern } from '$lib/training/types';

export interface ActiveSet {
	id: string;
	exercise_id: string;
	position: number;
	weight_lb: number | null;
	reps: number | null;
	duration_s: number | null;
	distance_m: number | null;
	rir: number | null;
	is_warmup: boolean;
	completed_at: string;
}

export interface ActiveExercise {
	exercise_id: string;
	name: string;
	measurement: string;
	progression: string;
	equipment: string | null;
	mechanic: string | null;
	/** Drives the mobility warm-up. Optional: sessions stored before this
	 *  existed won't have it, and must keep working. */
	movement_pattern?: MovementPattern | null;
	target_sets: number;
	rep_min: number | null;
	rep_max: number | null;
	increment_lb: number;
	bar_lb: number;
	/** Snapshotted at session start so mid-workout dead zones still show it. */
	history: LoggedSet[][];
}

export interface ActiveSession {
	id: string;
	/** Whose workout this is. Undefined on sessions stored before accounts
	 *  existed, which are treated as belonging to whoever is signed in — the
	 *  same tolerance `movement_pattern` gets above. */
	user_id?: number;
	routine_session_id: string | null;
	session_name: string;
	started_at: string;
	finished_at: string | null;
	notes: string | null;
	exercises: ActiveExercise[];
	sets: ActiveSet[];
	/** Mobility drills ticked off this session. Local only — never synced to
	 *  D1, never in history, invisible to volume and progression. */
	mobility_done?: string[];
	gym: {
		plates: { denomination_lb: number; pairs: number }[];
		dumbbell_step_lb: number;
		machine_step_lb: number;
	};
}

const DB_NAME = 'plateload';
const DB_VERSION = 1;
const ACTIVE = 'active_session';
const OUTBOX = 'outbox';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(ACTIVE)) db.createObjectStore(ACTIVE);
			if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return openDb().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const t = db.transaction(store, mode);
				const req = fn(t.objectStore(store));
				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(req.error);
			})
	);
}

export async function persistStorage(): Promise<void> {
	// iOS evicts storage from unused web apps; ask nicely once.
	try {
		if (navigator.storage?.persist) await navigator.storage.persist();
	} catch {
		/* best effort */
	}
}

const readActive = (): Promise<ActiveSession | undefined> =>
	tx(ACTIVE, 'readonly', (s) => s.get('current') as IDBRequest<ActiveSession | undefined>);

/**
 * The stored session, but only if it belongs to whoever is signed in. A shared
 * phone must not hand one person's workout to the next, and the stored copy
 * holds real training data, so a mismatch clears rather than resumes.
 */
export async function loadActive(userId?: number): Promise<ActiveSession | undefined> {
	const session = await readActive();
	if (!session) return undefined;
	if (userId !== undefined && session.user_id !== undefined && session.user_id !== userId) {
		await clearActive();
		return undefined;
	}
	return session;
}

export const saveActive = (session: ActiveSession): Promise<IDBValidKey> =>
	tx(ACTIVE, 'readwrite', (s) => s.put(structuredCloneSafe(session), 'current'));

export const clearActive = (): Promise<undefined> => tx(ACTIVE, 'readwrite', (s) => s.delete('current'));

// Svelte 5 $state proxies can't cross the structured-clone boundary.
function structuredCloneSafe<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

interface OutboxEntry {
	workout: {
		id: string;
		routine_session_id: string | null;
		started_at: string;
		finished_at: string | null;
		notes: string | null;
	};
	sets: ActiveSet[];
}

export function toPayload(session: ActiveSession): OutboxEntry {
	return {
		workout: {
			id: session.id,
			routine_session_id: session.routine_session_id,
			started_at: session.started_at,
			finished_at: session.finished_at,
			notes: session.notes
		},
		sets: session.sets
	};
}

export const enqueue = (entry: OutboxEntry): Promise<IDBValidKey> =>
	tx(OUTBOX, 'readwrite', (s) => s.put(structuredCloneSafe(entry), entry.workout.id));

const outboxAll = (): Promise<OutboxEntry[]> => tx(OUTBOX, 'readonly', (s) => s.getAll() as IDBRequest<OutboxEntry[]>);

const outboxDelete = (id: string): Promise<undefined> => tx(OUTBOX, 'readwrite', (s) => s.delete(id));

/** How many finished workouts are still waiting to reach the server. */
export const outboxCount = (): Promise<number> => outboxAll().then((e) => e.length);

/** Push everything pending. Safe to call any time; failures just wait. */
export async function drainOutbox(): Promise<{ sent: number; pending: number }> {
	const entries = await outboxAll();
	let sent = 0;
	for (const entry of entries) {
		try {
			const res = await fetch('/api/sync', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(entry)
			});
			// Only a success deletes, so nothing is ever lost to a failed push.
			// A 401 means the session expired: the rest would fail identically,
			// and these keep until someone signs back in.
			if (res.status === 401) break;
			if (res.ok) {
				await outboxDelete(entry.workout.id);
				sent++;
			}
		} catch {
			break; // offline — the rest can wait for the next drain
		}
	}
	return { sent, pending: entries.length - sent };
}

export function installDrainTriggers(): void {
	window.addEventListener('online', () => void drainOutbox());
	void drainOutbox();
}
