<script lang="ts">
	// Binary, not graded: a day was trained or it wasn't. Intensity shading
	// would imply the app knows what a hard day is, and it doesn't.
	import { localDay } from '$lib/training/streak';

	let { days, weeks = 26 }: { days: string[]; weeks?: number } = $props();

	const trained = $derived(new Set(days));

	// Columns run oldest to newest and start on Monday, so the rightmost column
	// is the week in progress and matches how currentStreak counts.
	const columns = $derived.by(() => {
		const today = new Date();
		const start = new Date(today);
		const mondayOffset = (start.getDay() + 6) % 7;
		start.setDate(start.getDate() - mondayOffset - (weeks - 1) * 7);
		const out: { day: string; future: boolean }[][] = [];
		for (let w = 0; w < weeks; w++) {
			const col: { day: string; future: boolean }[] = [];
			for (let d = 0; d < 7; d++) {
				const cell = new Date(start);
				cell.setDate(start.getDate() + w * 7 + d);
				col.push({ day: localDay(cell), future: cell > today });
			}
			out.push(col);
		}
		return out;
	});
</script>

<div class="heatmap" role="img" aria-label="{days.length} days trained in the last {weeks} weeks">
	{#each columns as col, i (i)}
		<div class="col">
			{#each col as cell (cell.day)}
				<span class="cell" class:on={trained.has(cell.day)} class:future={cell.future}></span>
			{/each}
		</div>
	{/each}
</div>

<style lang="scss">
	.heatmap {
		display: flex;
		gap: 2px;
		overflow-x: auto;
		padding-bottom: $space-1;
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.cell {
		width: 10px;
		height: 10px;
		border-radius: 1px;
		background: $hairline;

		&.on {
			background: $text;
		}

		&.future {
			background: $hairline-faint;
		}
	}
</style>
