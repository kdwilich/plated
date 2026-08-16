<script lang="ts">
	// The ⓘ that opens an exercise's guide. Wherever an exercise is named and
	// acting on it costs something — logging, adding, swapping — this is the way
	// to go read what it is first.

	let {
		exerciseId,
		name,
		size = 18
	}: { exerciseId: string; name: string; size?: number } = $props();
</script>

<a class="guide-link" href="/exercises/{exerciseId}" aria-label="{name} guide" title="Exercise guide">
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<circle cx="12" cy="12" r="9" />
		<line x1="12" y1="11" x2="12" y2="16.5" />
		<circle cx="12" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
	</svg>
</a>

<style lang="scss">
	.guide-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: $tap-target;
		flex-shrink: 0;
		align-self: stretch;
		color: $text-faint;
		border-left: 1px solid $hairline-faint;

		&:active {
			background: $hairline;
			color: $text-dim;
		}
	}
</style>
