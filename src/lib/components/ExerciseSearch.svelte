<script lang="ts">
	import type { ExerciseRow } from '$lib/server/catalog';

	let {
		placeholder = 'Search exercises…',
		onpick
	}: { placeholder?: string; onpick: (e: ExerciseRow) => void } = $props();

	let q = $state('');
	let results = $state.raw<ExerciseRow[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;

	function oninput() {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			if (!q.trim()) {
				results = [];
				return;
			}
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (res.ok) results = await res.json();
		}, 150);
	}
</script>

<div class="search">
	<input type="search" bind:value={q} {oninput} {placeholder} autocomplete="off" />
	{#if results.length > 0}
		<ul>
			{#each results as ex (ex.id)}
				<li>
					<button
						type="button"
						onclick={() => {
							onpick(ex);
							q = '';
							results = [];
						}}
					>
						<span class="name">{ex.name}</span>
						<span class="meta">{ex.equipment ?? ''}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	.search {
		position: relative;
	}

	ul {
		position: absolute;
		z-index: 10;
		inset-inline: 0;
		top: 100%;
		max-height: 40dvh;
		overflow-y: auto;
		background: $surface-raised;
		border: 1px solid $hairline;
		border-top: none;
	}

	li button {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: $space-3;
		width: 100%;
		min-height: $tap-target;
		padding: $space-2 $space-3;
		text-align: left;
		border-bottom: 1px solid $hairline-faint;

		&:active {
			background: $hairline;
		}
	}

	.name {
		font-size: 14px;
	}

	.meta {
		font-family: $font-mono;
		font-size: 11px;
		color: $text-faint;
		white-space: nowrap;
	}
</style>
