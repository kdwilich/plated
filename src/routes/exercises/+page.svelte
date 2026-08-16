<script lang="ts">
	import { goto } from '$app/navigation';
	import ExercisePicker from '$lib/components/ExercisePicker.svelte';

	let { data } = $props();

	// While the picker is filtering, it *is* the list — the A–Z browse below
	// would just be a second, contradictory answer to the same question.
	let picking = $state(false);

	// Digits and punctuation collect under "#" so the jump bar stays A–Z.
	function initial(name: string): string {
		const ch = name.trim().charAt(0).toUpperCase();
		return ch >= 'A' && ch <= 'Z' ? ch : '#';
	}

	const groups = $derived.by(() => {
		const out: { letter: string; items: typeof data.exercises }[] = [];
		for (const ex of data.exercises) {
			const letter = initial(ex.name);
			const last = out[out.length - 1];
			if (last && last.letter === letter) last.items.push(ex);
			else out.push({ letter, items: [ex] });
		}
		return out;
	});
</script>

<svelte:head><title>Plateload — exercises</title></svelte:head>

<h1 class="display page-title">Exercises</h1>

<ExercisePicker
	placeholder="Search all exercises…"
	guideLinks={false}
	onpick={(ex) => goto(`/exercises/${ex.id}`)}
	onnarrow={(v) => (picking = v)}
/>

{#if !picking}
	<nav class="jump" aria-label="Jump to letter">
		{#each groups as g (g.letter)}
			<a href="#letter-{g.letter}">{g.letter}</a>
		{/each}
	</nav>

	{#each groups as g (g.letter)}
		<section>
			<h2 class="letter label" id="letter-{g.letter}">{g.letter}</h2>
			<ul>
				{#each g.items as ex (ex.id)}
					<li>
						<a class="hairline-row row" href="/exercises/{ex.id}">
							<span class="name">{ex.name}</span>
							<span class="meta num">{ex.equipment ?? ''}</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-3;
	}

	.jump {
		display: flex;
		flex-wrap: wrap;
		gap: $space-1;
		margin: $space-4 0 $space-2;

		a {
			min-width: 26px;
			min-height: 30px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: $font-mono;
			font-size: 12px;
			color: $text-dim;
			border: 1px solid $hairline;
			border-radius: $radius;

			&:active {
				background: $hairline;
			}
		}
	}

	.letter {
		position: sticky;
		top: 0;
		z-index: 1;
		background: $ground;
		padding: $space-3 0 $space-1;
		border-bottom: 1px solid $hairline;
		scroll-margin-top: 0;
	}

	.row {
		gap: $space-3;
	}

	.name {
		font-size: 14px;
	}

	.meta {
		font-size: 11px;
		color: $text-faint;
		white-space: nowrap;
	}
</style>
