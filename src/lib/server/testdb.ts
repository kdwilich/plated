// A D1-shaped façade over node:sqlite, so the server modules can be tested
// without a Worker. Test-only — app code must never import this.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const d1 = (name: string) =>
	readFileSync(fileURLToPath(new URL(`../../../d1/${name}`, import.meta.url)), 'utf8');

type Arg = string | number | bigint | null | Uint8Array;

/** D1 takes booleans and stores 0/1; node:sqlite refuses them outright. */
function coerce(v: unknown): Arg {
	if (typeof v === 'boolean') return v ? 1 : 0;
	if (v === undefined) return null;
	return v as Arg;
}

// Plain fields rather than constructor parameter properties: node's strip-only
// TypeScript mode rejects those outright, and this file exists to be run by it.
class Stmt {
	db: DatabaseSync;
	sql: string;
	args: Arg[];

	constructor(db: DatabaseSync, sql: string, args: Arg[] = []) {
		this.db = db;
		this.sql = sql;
		this.args = args;
	}

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

/**
 * An empty database with the real schema and every migration applied.
 *
 * Foreign keys are enabled explicitly: D1 enforces them, node:sqlite does not
 * by default, and a cascade test that passes only because nothing was enforced
 * is worse than no test.
 */
export function testDb(): D1Database {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec(d1('schema.sql'));
	db.exec(d1('migrations/0001_multi_user.sql'));

	return {
		prepare: (sql: string) => new Stmt(db, sql),
		// D1's batch is the transaction. Sequential is honest enough here: what
		// these tests assert is ownership, not atomicity under failure.
		batch: async (stmts: Stmt[]) => {
			for (const s of stmts) await s.run();
			return [];
		}
	} as unknown as D1Database;
}
