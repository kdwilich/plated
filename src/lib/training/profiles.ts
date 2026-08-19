// Prescription profiles: named, cited positions instead of a slider that
// implies every point on it is defensible.

export interface Profile {
	key: string;
	name: string;
	rationale: string;
	source: string;
	weekly_sets_min: number;
	weekly_sets_max: number;
	/**
	 * The most sets one session may run. A ceiling on what the volume pass is
	 * allowed to *add*, never a trimmer — the template's own slots always
	 * survive. Past roughly this many working sets a session stops buying
	 * stimulus and starts buying fatigue and a longer stay in the gym.
	 */
	session_set_cap: number;
	compound: { rep_min: number; rep_max: number; sets: number };
	isolation: { rep_min: number; rep_max: number; sets: number };
	rir: number;
	rest_s: number;
}

export interface Prescription {
	target_sets: number;
	rep_min: number;
	rep_max: number;
	rir_target: number;
}

/**
 * The prescription for an exercise a human picked, rather than one the
 * generator slotted. `generate()` reads compound/isolation off its own template
 * slots; `mechanic` is the catalog's word for the same distinction and the only
 * signal available when the choice came from the picker.
 *
 * Anything the dataset declined to classify falls to isolation on purpose: an
 * unlabelled exercise is likelier a curl than a squat, and the failure mode is
 * a lighter prescription rather than a heavier one.
 */
export function prescriptionFor(
	profile: Profile,
	mechanic: string | null | undefined
): Prescription {
	const block = mechanic === 'compound' ? profile.compound : profile.isolation;
	return {
		target_sets: block.sets,
		rep_min: block.rep_min,
		rep_max: block.rep_max,
		rir_target: profile.rir
	};
}

export const PROFILES: Record<string, Profile> = {
	hypertrophy: {
		key: 'hypertrophy',
		name: 'Hypertrophy (evidence default)',
		rationale:
			'Growth tracks hard sets near failure; 10–20 weekly sets per muscle across a moderate rep range is where the meta-analyses cluster.',
		source: 'https://pubmed.ncbi.nlm.nih.gov/28834797/',
		weekly_sets_min: 10,
		weekly_sets_max: 20,
		session_set_cap: 24,
		compound: { rep_min: 6, rep_max: 10, sets: 3 },
		isolation: { rep_min: 10, rep_max: 15, sets: 3 },
		rir: 2,
		rest_s: 120
	},
	strength: {
		key: 'strength',
		name: 'Strength-leaning',
		rationale:
			'Maximal strength favors heavier loads, lower reps, longer rests, and more reps left in reserve so quality stays high.',
		source: 'https://pubmed.ncbi.nlm.nih.gov/28497285/',
		weekly_sets_min: 8,
		weekly_sets_max: 14,
		session_set_cap: 26,
		compound: { rep_min: 3, rep_max: 6, sets: 4 },
		isolation: { rep_min: 6, rep_max: 10, sets: 2 },
		rir: 2,
		rest_s: 180
	},
	minimalist: {
		key: 'minimalist',
		name: 'Minimalist',
		rationale:
			'Most of the gains for a fraction of the time: fewer, harder sets. The dose-response curve is steep at the start and flattens fast.',
		source: 'https://pubmed.ncbi.nlm.nih.gov/32247714/',
		weekly_sets_min: 6,
		weekly_sets_max: 10,
		session_set_cap: 16,
		compound: { rep_min: 6, rep_max: 12, sets: 2 },
		isolation: { rep_min: 10, rep_max: 15, sets: 2 },
		rir: 1,
		rest_s: 90
	}
};
