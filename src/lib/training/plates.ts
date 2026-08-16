// Plate math. The color bar in the logger is a direct render of solve().

import type { PlateStock } from './types.ts';

export interface PlateSolution {
	/** Denominations on ONE side of the bar, heaviest first. */
	perSide: number[];
	/** What the bar actually weighs with those plates: may differ from target. */
	achievedLb: number;
	exact: boolean;
}

// App-fixed color scale by lb denomination — consistent across gyms,
// whether they stock competition bumpers or rusty iron.
const PLATE_COLORS: Record<number, string> = {
	55: '#c8102e',
	45: '#0067a5',
	35: '#ffd100',
	25: '#00843d',
	10: '#f2f4f7',
	5: '#c8102e',
	// True black (#1f2227) was indistinguishable from the card background
	// ($surface #14161a / $surface-raised #191c21). Lifted enough to read
	// as its own block while staying the visibly darkest plate in the set.
	2.5: '#4b4f56'
};

export function plateColor(denomination: number): string {
	return PLATE_COLORS[denomination] ?? '#6e7480';
}

/** Relative visual height of a plate in the color bar, 0..1. */
export function plateScale(denomination: number): number {
	if (denomination >= 45) return 1;
	if (denomination >= 35) return 0.85;
	if (denomination >= 25) return 0.7;
	if (denomination >= 10) return 0.5;
	if (denomination >= 5) return 0.4;
	return 0.3;
}

/**
 * Greedy descending fit of the gym's actual plate inventory. Never returns a
 * load you cannot build: achievedLb is the truth, targetLb is the wish.
 */
export function solve(targetLb: number, barLb: number, plates: PlateStock[]): PlateSolution {
	const perSide: number[] = [];
	if (targetLb <= barLb) {
		return { perSide, achievedLb: barLb, exact: targetLb === barLb };
	}
	let remaining = (targetLb - barLb) / 2;
	const stock = [...plates].sort((a, b) => b.denomination_lb - a.denomination_lb);
	for (const { denomination_lb: d, pairs } of stock) {
		let available = pairs;
		while (available > 0 && remaining >= d - 1e-9) {
			perSide.push(d);
			remaining -= d;
			available--;
		}
	}
	const achievedLb = barLb + 2 * perSide.reduce((s, d) => s + d, 0);
	return { perSide, achievedLb, exact: Math.abs(achievedLb - targetLb) < 1e-9 };
}

/** Round a target to the nearest load the gym can actually build (never above). */
export function roundToLoadable(targetLb: number, barLb: number, plates: PlateStock[]): number {
	return solve(targetLb, barLb, plates).achievedLb;
}

/** The smallest possible barbell jump: one of the smallest plate per side. */
export function smallestBarbellJump(plates: PlateStock[]): number {
	if (plates.length === 0) return 5;
	return 2 * Math.min(...plates.map((p) => p.denomination_lb));
}
