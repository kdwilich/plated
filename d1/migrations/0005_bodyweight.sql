-- Bodyweight foundations (slice 4). seed.sql carries the same rows; this
-- brings a live catalog seeded before it to the same state without a reseed.
--
-- requires_bar: body-only work that needs a bar to hang from or press on.
-- The generator only offers it to a gym holding 'pull-up bar'. `equipment`
-- keeps meaning what it meant, because net load and increments key off
-- 'body only'.
ALTER TABLE exercise ADD COLUMN requires_bar INTEGER NOT NULL DEFAULT 0;

-- Every gym that has bodyweight work today had pull-ups in it. Give those
-- gyms the bar so the column takes nothing away on deploy; untick it on the
-- gym page if there is no bar.
INSERT OR IGNORE INTO gym_equipment (gym_id, equipment_key)
	SELECT gym_id, 'pull-up bar' FROM gym_equipment WHERE equipment_key = 'body only';

-- Refiled rows. Strength rows the dataset left without equipment are body-only
-- work; the bodyweight squat, walking lunge, decline push-up, inverted row,
-- glute-ham raises get the slots a floor gym was missing; the plain bridge
-- gets its Glute Bridge alias and cues; band
-- exercises become reachable when bands are the equipment; jump squats and
-- partner exercises leave the generator.
UPDATE exercise SET movement_pattern = 'rear_delt', priority = 32
	WHERE id IN ('Back_Flyes_-_With_Bands');
UPDATE exercise SET movement_pattern = 'hip_hinge', priority = 32
	WHERE id IN ('Band_Good_Morning', 'Band_Good_Morning_Pull_Through');
UPDATE exercise SET movement_pattern = 'rear_delt', priority = 24
	WHERE id IN ('Band_Pull_Apart');
UPDATE exercise SET movement_pattern = 'horizontal_press', priority = 32
	WHERE id IN ('Bench_Press_-_With_Bands');
UPDATE exercise SET movement_pattern = 'squat', priority = 38, cues = 'Sit between the heels, chest tall. Pause at the bottom when it gets easy, then go to split squats.'
	WHERE id IN ('Bodyweight_Squat');
UPDATE exercise SET measurement = 'reps_only', movement_pattern = 'lunge', equipment = 'body only', priority = 38
	WHERE id IN ('Bodyweight_Walking_Lunge');
UPDATE exercise SET cues = 'Heels close, ribs down. Drive through the heels to a full lockout and hold a beat.'
	WHERE id IN ('Butt_Lift_Bridge');
UPDATE exercise SET movement_pattern = 'calf_raise', priority = 24
	WHERE id IN ('Calf_Raises_-_With_Bands');
UPDATE exercise SET requires_bar = 1
	WHERE id IN ('Chin-Up', 'Dips_-_Triceps_Version', 'Gorilla_Chin_Crunch', 'Hanging_Leg_Raise', 'Hanging_Pike', 'Pullups', 'V-Bar_Pullup', 'Wide-Grip_Rear_Pull-Up');
UPDATE exercise SET measurement = 'reps_only', movement_pattern = 'incline_press', equipment = 'body only', priority = 38
	WHERE id IN ('Decline_Push-Up');
UPDATE exercise SET measurement = 'reps_only', movement_pattern = 'leg_curl', equipment = 'body only', priority = 28
	WHERE id IN ('Floor_Glute-Ham_Raise');
UPDATE exercise SET measurement = 'reps_only', movement_pattern = 'horizontal_pull', equipment = 'body only', priority = 40, requires_bar = 1, cues = 'Body in one line under a bar or rings. Pull the chest to the bar, squeeze the blades. Feet further forward makes it harder.'
	WHERE id IN ('Inverted_Row');
UPDATE exercise SET movement_pattern = 'lateral_raise', priority = 24
	WHERE id IN ('Lateral_Raise_-_With_Bands');
UPDATE exercise SET movement_pattern = 'leg_curl', priority = 36, cues = 'Knees anchored, hips straight. Lower as slowly as you can, catch with the hands, pull back up.'
	WHERE id IN ('Natural_Glute_Ham_Raise');
UPDATE exercise SET measurement = 'reps_only', equipment = 'body only'
	WHERE id IN ('Prone_Manual_Hamstring');
UPDATE exercise SET measurement = 'reps_only', equipment = 'body only', requires_bar = 1
	WHERE id IN ('Scapular_Pull-Up');
UPDATE exercise SET movement_pattern = 'vertical_press', priority = 32
	WHERE id IN ('Shoulder_Press_-_With_Bands');
UPDATE exercise SET movement_pattern = 'squat', priority = 32
	WHERE id IN ('Squats_-_With_Bands');
UPDATE exercise SET movement_pattern = NULL, priority = 0
	WHERE id IN ('Standing_Towel_Triceps_Extension', 'Weighted_Jump_Squat');

-- Staples. Stable ids; routines will reference them.
INSERT OR IGNORE INTO exercise (id,name,measurement,movement_pattern,progression,equipment,primary_muscles,secondary_muscles,unilateral,mechanic,level,priority,instructions,cues,image,requires_bar) VALUES ('bw-bulgarian-split-squat','Bulgarian Split Squat (Bodyweight)','reps_only','lunge','double','body only','["quadriceps"]','["glutes","hamstrings"]',0,'compound','beginner',45,NULL,'Back foot on a chair or bench. Drop straight down, front knee travels over the toes. Most of the weight stays on the front leg.',NULL,0);
INSERT OR IGNORE INTO exercise (id,name,measurement,movement_pattern,progression,equipment,primary_muscles,secondary_muscles,unilateral,mechanic,level,priority,instructions,cues,image,requires_bar) VALUES ('bw-pike-push-up','Pike Push-Up','reps_only','vertical_press','double','body only','["shoulders"]','["triceps"]',0,'compound','beginner',45,NULL,'Hips high, head travels forward of the hands into a tripod. Feet on a box makes it harder; a wall handstand is the next step.',NULL,0);
INSERT OR IGNORE INTO exercise (id,name,measurement,movement_pattern,progression,equipment,primary_muscles,secondary_muscles,unilateral,mechanic,level,priority,instructions,cues,image,requires_bar) VALUES ('bw-single-leg-calf-raise','Single-Leg Calf Raise','reps_only','calf_raise','double','body only','["calves"]','[]',1,'isolation','beginner',40,NULL,'Ball of the foot on a step, fingertips on a wall. Full stretch at the bottom, pause; full rise, pause.',NULL,0);
INSERT OR IGNORE INTO exercise (id,name,measurement,movement_pattern,progression,equipment,primary_muscles,secondary_muscles,unilateral,mechanic,level,priority,instructions,cues,image,requires_bar) VALUES ('bw-single-leg-rdl','Single-Leg Romanian Deadlift (Bodyweight)','reps_only','hip_hinge','double','body only','["hamstrings"]','["glutes","lower back"]',1,'compound','beginner',40,NULL,'Soft standing knee, hips square to the floor. Reach long through the back heel until the hamstring stops you. Slow is the load.',NULL,0);

-- Aliases and search rows, only for rows that exist: on a fresh database
-- the migrations run before seed.sql, which writes these itself.
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'Bodyweight_Squat', 'Air Squat' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Bodyweight_Squat');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'Butt_Lift_Bridge', 'Glute Bridge' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Butt_Lift_Bridge');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'Inverted_Row', 'Bodyweight Row' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Inverted_Row');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'Inverted_Row', 'Australian Pull-Up' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Inverted_Row');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'Natural_Glute_Ham_Raise', 'Nordic Curl' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Natural_Glute_Ham_Raise');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'Natural_Glute_Ham_Raise', 'Nordic Hamstring Curl' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Natural_Glute_Ham_Raise');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'bw-bulgarian-split-squat', 'Rear-Foot Elevated Split Squat' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-bulgarian-split-squat');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'bw-bulgarian-split-squat', 'RFESS' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-bulgarian-split-squat');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'bw-single-leg-rdl', 'Single-Leg RDL' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-single-leg-rdl');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'bw-single-leg-rdl', 'SL RDL' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-single-leg-rdl');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'bw-single-leg-calf-raise', 'Single-Leg Calf Raise (Bodyweight)' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-single-leg-calf-raise');
INSERT OR IGNORE INTO exercise_alias (exercise_id, alias) SELECT 'bw-pike-push-up', 'Pike Pushup' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-pike-push-up');

DELETE FROM exercise_fts WHERE id IN ('Bodyweight_Squat', 'Butt_Lift_Bridge', 'Inverted_Row', 'Natural_Glute_Ham_Raise', 'bw-bulgarian-split-squat', 'bw-single-leg-rdl', 'bw-single-leg-calf-raise', 'bw-pike-push-up');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'Bodyweight_Squat', 'Bodyweight Squat', 'Air Squat' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Bodyweight_Squat');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'Butt_Lift_Bridge', 'Butt Lift (Bridge)', 'Glute Bridge' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Butt_Lift_Bridge');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'Inverted_Row', 'Inverted Row', 'Bodyweight Row Australian Pull-Up' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Inverted_Row');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'Natural_Glute_Ham_Raise', 'Natural Glute Ham Raise', 'Nordic Curl Nordic Hamstring Curl' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'Natural_Glute_Ham_Raise');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'bw-bulgarian-split-squat', 'Bulgarian Split Squat (Bodyweight)', 'Rear-Foot Elevated Split Squat RFESS' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-bulgarian-split-squat');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'bw-single-leg-rdl', 'Single-Leg Romanian Deadlift (Bodyweight)', 'Single-Leg RDL SL RDL' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-single-leg-rdl');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'bw-single-leg-calf-raise', 'Single-Leg Calf Raise', 'Single-Leg Calf Raise (Bodyweight)' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-single-leg-calf-raise');
INSERT INTO exercise_fts (id, name, aliases) SELECT 'bw-pike-push-up', 'Pike Push-Up', 'Pike Pushup' WHERE EXISTS (SELECT 1 FROM exercise WHERE id = 'bw-pike-push-up');
