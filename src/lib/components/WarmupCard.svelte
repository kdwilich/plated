<script lang="ts">
	// The general warm-up, above the first lift. warmup.ts ramps the bar; this
	// gets you loose. Ticks are local to the session and never leave the device.
	import type { MobilityDrill } from '$lib/training/mobility';

	let {
		drills,
		done = [],
		ontoggle
	}: {
		drills: MobilityDrill[];
		done: string[];
		ontoggle: (key: string) => void;
	} = $props();

	// The opener has no catalog id, so it needs a stable key of its own.
	const keyOf = (d: MobilityDrill) => d.exercise_id ?? `_${d.name}`;

	let allDone = $derived(drills.length > 0 && drills.every((d) => done.includes(keyOf(d))));
	let collapsed = $state(false);

	// Fold away once the last one is ticked, but stay reopenable.
	$effect(() => {
		if (allDone) collapsed = true;
	});
</script>

<section class="warmup card" class:done={allDone}>
	<button class="warmup-head" onclick={() => (collapsed = !collapsed)} aria-expanded={!collapsed}>
		<span class="label">Warm up</span>
		<span class="num status">
			{#if allDone && collapsed}Warmed up ✓{:else}{done.length}/{drills.length}{/if}
		</span>
	</button>

	{#if !collapsed}
		<ul class="drills">
			{#each drills as d (keyOf(d))}
				{@const key = keyOf(d)}
				{@const checked = done.includes(key)}
				<li class="hairline-row" class:checked>
					<button class="tick" onclick={() => ontoggle(key)} aria-pressed={checked}>
						<span class="box" aria-hidden="true">{checked ? '✓' : ''}</span>
						<span class="drill-main">
							<span class="drill-name">{d.name}</span>
							<span class="why label">{d.why}</span>
						</span>
						<span class="num dose">{d.dose}</span>
					</button>
					{#if d.exercise_id}
						<a
							class="guide-link"
							href="/exercises/{d.exercise_id}"
							aria-label="{d.name} guide"
							title="Exercise guide"
						>
							<svg
								width="16"
								height="16"
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
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style lang="scss">
	.warmup {
		margin-bottom: $space-3;

		&.done {
			border-left: 2px solid $ok;
		}
	}

	.warmup-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: $tap-target;
		padding: 0 $space-3;
		background: none;
		border: 0;
		color: inherit;
		text-align: left;
	}

	.status {
		font-size: 12px;
		color: $text-faint;
	}

	.drills {
		list-style: none;
		margin: 0;
		padding: 0;

		li:last-child {
			border-bottom: 0;
		}
	}

	.tick {
		display: flex;
		align-items: center;
		gap: $space-3;
		flex: 1;
		min-width: 0;
		padding: $space-2 $space-3;
		background: none;
		border: 0;
		color: inherit;
		text-align: left;

		&:active {
			background: $hairline-faint;
		}
	}

	.box {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border: 1px solid $hairline;
		border-radius: $radius;
		color: $ok;
		font-size: 12px;
		line-height: 1;
	}

	.checked .box {
		border-color: $ok;
	}

	.drill-main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.drill-name {
		font-family: $font-display;
		font-weight: 600;
		font-size: 17px;
		letter-spacing: 0.02em;
	}

	.checked .drill-name {
		color: $text-faint;
		text-decoration: line-through;
	}

	.why {
		font-size: 10px;
	}

	.dose {
		flex-shrink: 0;
		margin-left: auto;
		font-size: 12px;
		color: $text-dim;
	}

	.guide-link {
		display: flex;
		align-items: center;
		justify-content: center;
		width: $tap-target;
		flex-shrink: 0;
		color: $text-faint;
		border-left: 1px solid $hairline-faint;

		&:active {
			background: $hairline;
			color: $text-dim;
		}
	}
</style>
