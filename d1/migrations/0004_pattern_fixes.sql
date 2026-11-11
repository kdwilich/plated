-- Movement-pattern corrections from the 2026-11-10 split review. seed.sql
-- carries the same values; this rides a migration so a deploy fixes the live
-- catalog without re-running the whole seed.
--
-- Triceps-primary presses (dips, close-grip bench and push-ups, floor presses)
-- were filling the chest-press slot, dips ahead of push-ups in a bodyweight
-- gym. Refiled as triceps work, the bench and push-up variants drop below the
-- real extensions; close-grip bench and the dips keep their rank. Handstand
-- push-ups were a horizontal press, leaving a bodyweight gym no overhead
-- press. Chest-primary pullovers were filling the pull-day pullover slot;
-- they file as chest flyes, behind the real ones, and keep counting as volume.
UPDATE exercise SET movement_pattern = 'chest_fly', priority = 30
	WHERE id IN ('Bent-Arm_Dumbbell_Pullover', 'Front_Raise_And_Pullover', 'Straight-Arm_Dumbbell_Pullover', 'Wide-Grip_Decline_Barbell_Pullover');
UPDATE exercise SET movement_pattern = 'triceps_extension', priority = 24
	WHERE id IN ('Close-Grip_Push-Up_off_of_a_Dumbbell', 'Push-Ups_-_Close_Triceps_Position');
UPDATE exercise SET movement_pattern = 'triceps_extension', priority = 25
	WHERE id IN ('Ring_Dips');
UPDATE exercise SET movement_pattern = 'triceps_extension', priority = 30
	WHERE id IN ('Bench_Press_-_Powerlifting', 'Dumbbell_Floor_Press', 'Floor_Press', 'Incline_Push-Up_Close-Grip', 'One_Arm_Floor_Press', 'Reverse_Band_Bench_Press', 'Reverse_Triceps_Bench_Press');
UPDATE exercise SET movement_pattern = 'triceps_extension', priority = 38
	WHERE id IN ('Bench_Dips');
UPDATE exercise SET movement_pattern = 'triceps_extension', priority = 52
	WHERE id IN ('Dip_Machine');
UPDATE exercise SET movement_pattern = 'triceps_extension', priority = 84
	WHERE id IN ('Dips_-_Triceps_Version');
UPDATE exercise SET movement_pattern = 'triceps_extension', priority = 86
	WHERE id IN ('Close-Grip_Barbell_Bench_Press');
UPDATE exercise SET movement_pattern = 'vertical_press', priority = 34
	WHERE id IN ('Handstand_Push-Ups');
