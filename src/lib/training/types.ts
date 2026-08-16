// Shared types for the pure training core. No DOM, no D1, no $lib imports —
// everything in src/lib/training runs under `node --test`.

export type Measurement = 'load_reps' | 'reps_only' | 'time' | 'load_time' | 'distance_time';
export type ProgressionKind = 'double' | 'time' | 'none';

export type MovementPattern =
	| 'horizontal_press'
	| 'incline_press'
	| 'vertical_press'
	| 'horizontal_pull'
	| 'vertical_pull'
	| 'squat'
	| 'hip_hinge'
	| 'hip_thrust'
	| 'lunge'
	| 'chest_fly'
	| 'lateral_raise'
	| 'rear_delt'
	| 'pullover'
	| 'shrug'
	| 'biceps_curl'
	| 'triceps_extension'
	| 'leg_curl'
	| 'leg_extension'
	| 'calf_raise'
	| 'ab_flexion'
	| 'anti_extension'
	| 'loaded_carry';

export interface Exercise {
	id: string;
	name: string;
	measurement: Measurement;
	movement_pattern: MovementPattern | null;
	progression: ProgressionKind;
	equipment: string | null;
	primary_muscles: string[];
	secondary_muscles: string[];
	unilateral: boolean;
	priority: number;
}

export interface PlateStock {
	denomination_lb: number;
	pairs: number;
}

export interface Bar {
	id: string;
	name: string;
	weight_lb: number;
	is_default: boolean;
}

export interface GymConfig {
	equipment: string[];
	plates: PlateStock[];
	bars: Bar[];
	dumbbell_step_lb: number;
	machine_step_lb: number;
}

/** A completed working set, as logged. */
export interface LoggedSet {
	weight_lb: number | null;
	reps: number | null;
	duration_s: number | null;
	is_warmup: boolean;
}

export interface PrescribedExercise {
	exercise: Exercise;
	target_sets: number;
	rep_min: number;
	rep_max: number;
	rir_target: number;
}

export interface SessionDraft {
	name: string;
	exercises: PrescribedExercise[];
}

export interface RoutineDraft {
	profile_key: string;
	sessions: SessionDraft[];
	warnings: string[];
}
