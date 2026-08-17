import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getActiveRoutine } from '$lib/server/routines';
import { lastCompletedPosition, recentTrainedMuscles } from '$lib/server/workouts';
import { muscleGroup, nextPosition, stalenessByGroup } from '$lib/training/volume';

export const load: PageServerLoad = async ({ platform, locals }) => {
	const db = getDb(platform);
	const uid = locals.user!.id;
	const routine = await getActiveRoutine(db, uid);

	let next: number | null = null;
	let staleness: Record<string, number> = {};
	let sessionGroups: Record<string, string[]> = {};

	if (routine) {
		const last = await lastCompletedPosition(db, uid, routine.id);
		next = nextPosition(routine.sessions.length, last);

		const trained = await recentTrainedMuscles(db, uid);
		const pairs: { group: string; completed_at: string }[] = [];
		for (const t of trained) {
			for (const m of JSON.parse(t.primary_muscles) as string[]) {
				const g = muscleGroup(m);
				if (g) pairs.push({ group: g, completed_at: t.completed_at });
			}
		}
		staleness = stalenessByGroup(pairs, new Date());

		for (const s of routine.sessions) {
			const groups = new Set<string>();
			for (const e of s.exercises) {
				if (!e.exercise.movement_pattern) continue;
				for (const m of e.exercise.primary_muscles) {
					const g = muscleGroup(m);
					if (g) groups.add(g);
				}
			}
			sessionGroups[s.id] = [...groups];
		}
	}

	return {
		routine: routine
			? {
					id: routine.id,
					name: routine.name,
					sessions: routine.sessions.map((s) => ({
						id: s.id,
						position: s.position,
						name: s.name,
						exercise_count: s.exercises.length,
						groups: sessionGroups[s.id] ?? []
					}))
				}
			: null,
		next,
		staleness
	};
};
