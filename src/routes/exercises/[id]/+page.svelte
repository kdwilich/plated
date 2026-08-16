<script lang="ts">
	let { data } = $props();

	const ex = $derived(data.exercise);
	const youtubeUrl = $derived(
		ex.video_id
			? `https://www.youtube.com/watch?v=${ex.video_id}`
			: `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' form')}`
	);
	const imageUrl = $derived(
		ex.image
			? `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${ex.image}`
			: null
	);
	const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
</script>

<svelte:head><title>Plateload — {ex.name}</title></svelte:head>

<h1 class="display page-title">{ex.name}</h1>
{#if ex.aliases?.length}
	<p class="aliases num">aka {ex.aliases.join(' · ')}</p>
{/if}

<p class="meta num">
	{[ex.equipment, ex.mechanic, ex.level].filter(Boolean).join(' · ')}
	{#if ex.movement_pattern}
		· {ex.movement_pattern.replace('_', ' ')}
	{/if}
</p>

<p class="muscles">
	<span class="label">Targets</span>
	{ex.primary_muscles.join(', ')}
	{#if ex.secondary_muscles.length}
		<span class="secondary">+ {ex.secondary_muscles.join(', ')}</span>
	{/if}
</p>

{#if ex.cues}
	<div class="card block cues">
		<span class="label">Cues</span>
		<p>{ex.cues}</p>
	</div>
{/if}

<a class="btn video" href={youtubeUrl} target="_blank" rel="noopener">
	{ex.video_id ? 'Watch form video' : 'Search form videos on YouTube'} ↗
</a>

{#if data.history.length > 0}
	<div class="card block">
		<span class="label">Last time</span>
		<ul>
			{#each data.history[0].filter((s) => !s.is_warmup) as s, i (i)}
				<li class="hairline-row set-row">
					<span class="num set-label">SET {i + 1}</span>
					<span class="num">
						{#if s.weight_lb != null}{fmt(s.weight_lb)}{/if}
						{#if s.reps != null}&nbsp;× {s.reps}{/if}
						{#if s.duration_s != null}&nbsp;{s.duration_s}s{/if}
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#if imageUrl}
	<img class="figure" src={imageUrl} alt="{ex.name} demonstration" loading="lazy" />
{/if}

{#if ex.instructions}
	<div class="card block">
		<span class="label">How to do it</span>
		{#each ex.instructions.split('\n') as step, i (i)}
			<p class="step"><span class="num step-n">{i + 1}</span>{step}</p>
		{/each}
	</div>
{/if}

<style lang="scss">
	.page-title {
		font-size: 28px;
		margin-bottom: $space-1;
	}

	.aliases {
		font-size: 12px;
		color: $text-faint;
		margin-bottom: $space-2;
	}

	.meta {
		font-size: 12px;
		color: $text-dim;
		margin-bottom: $space-3;
	}

	.muscles {
		font-size: 14px;
		margin-bottom: $space-4;

		.label {
			display: block;
			margin-bottom: 2px;
		}

		.secondary {
			color: $text-dim;
		}
	}

	.block {
		padding: $space-3 $space-4;
		margin-bottom: $space-3;

		.label {
			display: block;
			margin-bottom: $space-2;
		}
	}

	.cues p {
		font-size: 14px;
		line-height: 1.55;
	}

	.video {
		width: 100%;
		margin-bottom: $space-3;
	}

	.set-row {
		min-height: 36px;
	}

	.set-label {
		font-size: 11px;
		color: $text-faint;
	}

	.figure {
		border: 1px solid $hairline;
		border-radius: $radius;
		margin-bottom: $space-3;
	}

	.step {
		display: flex;
		gap: $space-3;
		font-size: 14px;
		line-height: 1.55;
		margin-bottom: $space-2;
	}

	.step-n {
		color: $text-faint;
		font-size: 12px;
		padding-top: 2px;
	}
</style>
