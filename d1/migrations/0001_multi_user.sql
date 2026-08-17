-- Accounts. Everything written before this belongs to user 1 by column default,
-- so the first account created adopts the existing data. That is deliberate,
-- and it is also a hazard: see Task 14 of the multi-user plan.

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
