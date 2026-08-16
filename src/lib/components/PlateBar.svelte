<script lang="ts">
	// The color bar: one side of the bar, rendered from the plate solver.
	// Color encodes load — you read the bar and know what to grab.
	import { plateColor, plateScale } from '$lib/training/plates';

	let {
		perSide,
		barLb = null,
		height = 26
	}: { perSide: number[]; barLb?: number | null; height?: number } = $props();
</script>

<div class="plate-bar" style:--h="{height}px">
	{#if barLb !== null}
		<span class="bar-stub num">{barLb}</span>
	{/if}
	{#each perSide as d, i (i)}
		<span
			class="plate"
			style:background={plateColor(d)}
			style:height="{Math.round(plateScale(d) * height)}px"
			title="{d} lb"
		></span>
	{/each}
	{#if perSide.length === 0 && barLb !== null}
		<span class="empty">empty bar</span>
	{/if}
</div>

<style lang="scss">
	.plate-bar {
		display: flex;
		align-items: center;
		gap: 3px;
		min-height: var(--h);
	}

	.bar-stub {
		font-size: 11px;
		color: $text-faint;
		margin-right: $space-2;
		border-right: 2px solid $hairline;
		padding-right: $space-2;
		align-self: stretch;
		display: flex;
		align-items: center;
	}

	.plate {
		width: 13px;
		border-radius: 1px;
	}

	.empty {
		font-family: $font-mono;
		font-size: 11px;
		color: $text-faint;
		letter-spacing: 0.06em;
	}
</style>
