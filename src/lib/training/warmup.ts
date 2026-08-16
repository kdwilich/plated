// Warmup ramp — the other thing you compute in your head at the rack.
// Every step is rounded to a load the gym can actually build.

import type { GymConfig } from './types.ts';
import { roundToLoadable } from './plates.ts';

export interface WarmupSet {
	weight_lb: number;
	reps: number;
}

export function ramp(
	workingLb: number,
	equipment: string | null,
	gym: GymConfig,
	barLb: number,
	isCompound: boolean
): WarmupSet[] {
	if (workingLb <= 0) return [];

	if (equipment === 'barbell' || equipment === 'e-z curl bar') {
		if (workingLb <= barLb) return [];
		const steps: WarmupSet[] = [{ weight_lb: barLb, reps: 10 }];
		const fractions: [number, number][] = isCompound
			? [
					[0.55, 5],
					[0.75, 3],
					[0.9, 1]
				]
			: [[0.6, 6]];
		for (const [f, reps] of fractions) {
			const w = roundToLoadable(workingLb * f, barLb, gym.plates);
			const prev = steps[steps.length - 1].weight_lb;
			// Only steps that meaningfully bridge bar -> working weight
			if (w > prev + 5 && w < workingLb - 2.5) steps.push({ weight_lb: w, reps });
		}
		return steps;
	}

	const step =
		equipment === 'dumbbell' || equipment === 'kettlebells'
			? gym.dumbbell_step_lb
			: gym.machine_step_lb;
	const round = (lb: number) => Math.max(step, Math.round(lb / step) * step);
	const fractions: [number, number][] = isCompound
		? [
				[0.5, 8],
				[0.75, 4]
			]
		: [[0.6, 8]];
	const steps: WarmupSet[] = [];
	for (const [f, reps] of fractions) {
		const w = round(workingLb * f);
		if (w < workingLb && !steps.some((s) => s.weight_lb === w)) steps.push({ weight_lb: w, reps });
	}
	return steps;
}
