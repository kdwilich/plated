<script lang="ts">
	// Sheet that holds an exercise guide without leaving the page you were on.
	// It owns a history entry (see GuideLink), so back and swipe-back dismiss it
	// rather than throwing away an in-progress swap.
	import type { Snippet } from 'svelte';

	let { onclose, children }: { onclose: () => void; children: Snippet } = $props();

	// The page underneath keeps its scroll position; only the sheet scrolls.
	$effect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" role="presentation" onclick={onclose}></div>

<div class="sheet" role="dialog" aria-modal="true" aria-label="Exercise guide">
	<header class="sheet-head">
		<span class="label">Guide</span>
		<button class="close" onclick={onclose} aria-label="Close guide">×</button>
	</header>
	<div class="sheet-body">
		{@render children()}
	</div>
</div>

<style lang="scss">
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: rgba(0, 0, 0, 0.6);
	}

	.sheet {
		position: fixed;
		z-index: 21;
		left: 50%;
		transform: translateX(-50%);
		bottom: 0;
		width: 100%;
		max-width: 560px;
		max-height: 88dvh;
		display: flex;
		flex-direction: column;
		background: $ground;
		border: 1px solid $hairline;
		border-bottom: 0;
		border-radius: $radius $radius 0 0;
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex: none;
		padding: 0 $space-2 0 $space-4;
		border-bottom: 1px solid $hairline;
	}

	.close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: $tap-target;
		min-height: $tap-target;
		font-size: 26px;
		line-height: 1;
		color: $text-dim;

		&:active {
			color: $text;
		}
	}

	.sheet-body {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: $space-4 $space-4 calc($space-6 + env(safe-area-inset-bottom));
	}
</style>
