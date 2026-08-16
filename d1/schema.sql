-- Plateload schema. D1 (sqlite). db.batch() is the transaction.

CREATE TABLE IF NOT EXISTS exercise (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	-- How a set is recorded
	measurement TEXT NOT NULL CHECK (measurement IN ('load_reps','reps_only','time','load_time','distance_time')),
	-- Whether the generator can reach it. NULL = loggable but never generated.
	movement_pattern TEXT,
	-- What the app suggests next time
	progression TEXT NOT NULL CHECK (progression IN ('double','time','none')),
	equipment TEXT,
	primary_muscles TEXT NOT NULL DEFAULT '[]',
	secondary_muscles TEXT NOT NULL DEFAULT '[]',
	unilateral INTEGER NOT NULL DEFAULT 0,
	mechanic TEXT,
	level TEXT,
	-- Generator slot-filling rank; higher wins. 0 = never a first choice.
	priority INTEGER NOT NULL DEFAULT 0,
	instructions TEXT,
	cues TEXT,
	video_id TEXT,
	image TEXT,
	is_custom INTEGER NOT NULL DEFAULT 0,
	user_id INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_exercise_pattern ON exercise (movement_pattern, priority DESC)
	WHERE movement_pattern IS NOT NULL;

CREATE TABLE IF NOT EXISTS exercise_alias (
	exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
	alias TEXT NOT NULL,
	PRIMARY KEY (exercise_id, alias)
);

-- App-maintained; rebuilt wholesale by the seed script.
CREATE VIRTUAL TABLE IF NOT EXISTS exercise_fts USING fts5(id UNINDEXED, name, aliases);

CREATE TABLE IF NOT EXISTS gym (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	dumbbell_step_lb REAL NOT NULL DEFAULT 5,
	machine_step_lb REAL NOT NULL DEFAULT 10,
	user_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gym_equipment (
	gym_id TEXT NOT NULL REFERENCES gym(id) ON DELETE CASCADE,
	equipment_key TEXT NOT NULL,
	PRIMARY KEY (gym_id, equipment_key)
);

CREATE TABLE IF NOT EXISTS gym_plate (
	gym_id TEXT NOT NULL REFERENCES gym(id) ON DELETE CASCADE,
	denomination_lb REAL NOT NULL,
	pairs INTEGER NOT NULL DEFAULT 10,
	PRIMARY KEY (gym_id, denomination_lb)
);

CREATE TABLE IF NOT EXISTS gym_bar (
	id TEXT PRIMARY KEY,
	gym_id TEXT NOT NULL REFERENCES gym(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	weight_lb REAL NOT NULL,
	is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS routine (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	profile_key TEXT NOT NULL DEFAULT 'hypertrophy',
	gym_id TEXT REFERENCES gym(id),
	is_active INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	user_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS routine_session (
	id TEXT PRIMARY KEY,
	routine_id TEXT NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
	position INTEGER NOT NULL,
	name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_exercise (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES routine_session(id) ON DELETE CASCADE,
	position INTEGER NOT NULL,
	exercise_id TEXT NOT NULL REFERENCES exercise(id),
	target_sets INTEGER NOT NULL DEFAULT 3,
	rep_min INTEGER,
	rep_max INTEGER,
	rir_target INTEGER,
	bar_id TEXT REFERENCES gym_bar(id),   -- NULL -> gym's default bar
	increment_lb REAL                     -- NULL -> equipment-derived jump
);

-- All ids are client-generated UUIDs so the sync POST is idempotent.
CREATE TABLE IF NOT EXISTS workout (
	id TEXT PRIMARY KEY,
	routine_session_id TEXT,
	started_at TEXT NOT NULL,
	finished_at TEXT,
	notes TEXT,
	user_id INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_workout_started ON workout (started_at DESC);

CREATE TABLE IF NOT EXISTS workout_set (
	id TEXT PRIMARY KEY,
	workout_id TEXT NOT NULL REFERENCES workout(id) ON DELETE CASCADE,
	exercise_id TEXT NOT NULL,
	position INTEGER NOT NULL,
	weight_lb REAL,
	reps INTEGER,
	duration_s INTEGER,
	distance_m REAL,
	rir INTEGER,
	is_warmup INTEGER NOT NULL DEFAULT 0,
	completed_at TEXT NOT NULL
);

-- Powers "last time you did this" — the app's highest-value query.
CREATE INDEX IF NOT EXISTS idx_set_exercise_time ON workout_set (exercise_id, completed_at DESC);
