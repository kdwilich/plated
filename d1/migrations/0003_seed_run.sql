-- The one catalog row the app cannot do without: every logged run points at
-- `run` (see src/routes/run/+page.svelte). The full catalog is seeded by hand
-- from d1/seed.sql, which is too big to re-run on every deploy; this single
-- row rides a migration so a deploy can never read a run whose exercise is
-- missing. seed.sql carries the same row and upserts over it harmlessly.
--
-- OR IGNORE, not OR REPLACE: if seed.sql got there first its row stands.
INSERT OR IGNORE INTO exercise (id, name, measurement, movement_pattern, progression, equipment,
	primary_muscles, secondary_muscles, unilateral, mechanic, level, priority, instructions, cues, image)
VALUES ('run', 'Run', 'distance_time', NULL, 'none', NULL, '[]', '[]', 0, NULL, NULL, 0, NULL,
	'Distance and time. Surface, route and how it felt go in the note.', NULL);
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) VALUES ('run', 'Running');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) VALUES ('run', 'Jog');
-- FTS has no primary key, so a duplicate would be two search hits. Delete
-- first; a DELETE on a virtual table with no match is a no-op.
DELETE FROM exercise_fts WHERE id = 'run';
INSERT INTO exercise_fts (id, name, aliases) VALUES ('run', 'Run', 'Running Jog');
