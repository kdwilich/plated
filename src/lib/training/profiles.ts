// Prescription profiles: named, cited positions instead of a slider that
// implies every point on it is defensible.

export interface Profile {
	key: string;
	name: string;
	rationale: string;
	source: string;
	weekly_sets_min: number;
	weekly_sets_max: number;
	compound: { rep_min: number; rep_max: number; sets: number };
	isolation: { rep_min: number; rep_max: number; sets: number };
	rir: number;
	rest_s: number;
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
		compound: { rep_min: 6, rep_max: 12, sets: 2 },
		isolation: { rep_min: 10, rep_max: 15, sets: 2 },
		rir: 1,
		rest_s: 90
	}
};
