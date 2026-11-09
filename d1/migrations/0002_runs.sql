-- A run is a workout with one distance_time set. These two columns are what a
-- set cannot hold: what kind of run it was, and how hard it felt overall.
--
-- No CHECK on run_type. SQLite cannot alter a CHECK, and rebuilding `workout`
-- means dropping the tables that reference it. Validation lives in
-- src/lib/training/running.ts and the sync endpoint refuses anything else.
--
-- NULL run_type means a strength workout, so every row written before this
-- keeps its meaning without a backfill.
ALTER TABLE workout ADD COLUMN run_type TEXT;
ALTER TABLE workout ADD COLUMN effort INTEGER;
