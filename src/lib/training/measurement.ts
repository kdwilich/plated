// How a set is recorded, keyed off exercise.measurement. Extracted so the
// logger and the history editor cannot drift: both decide which inputs an
// exercise gets from these three predicates.

export function usesLoad(measurement: string): boolean {
	return measurement === 'load_reps' || measurement === 'load_time';
}

export function usesReps(measurement: string): boolean {
	return measurement === 'load_reps' || measurement === 'reps_only';
}

export function usesTime(measurement: string): boolean {
	return measurement === 'time' || measurement === 'load_time' || measurement === 'distance_time';
}

/**
 * Pull-ups, chin-ups, dips: weight_lb is a net offset from bodyweight — 0 is
 * bodyweight only, negative is assisted, positive is added.
 */
export function allowsNegativeLoad(equipment: string | null, measurement: string): boolean {
	return equipment === 'body only' && usesLoad(measurement);
}
