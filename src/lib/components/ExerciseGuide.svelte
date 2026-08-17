<script lang="ts">
	// The guide body, shared by the /exercises/[id] route and the shallow-routed
	// modal. No <svelte:head> here on purpose: the route owns the document title,
	// the modal must not touch it.
	import type { ExerciseRow } from '$lib/server/catalog';
	import type { PersonalRecord } from '$lib/training/records';
	import type { LoggedSet } from '$lib/training/types';

	let {
		exercise,
		history = [],
		records = []
	}: { exercise: ExerciseRow; history: LoggedSet[][]; records?: PersonalRecord[] } = $props();

	const ex = $derived(exercise);
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

	function fmtDuration(s: number): string {
		const m = Math.floor(s / 60);
		const rem = Math.round(s % 60);
		return m > 0 ? `${m}:${String(rem).padStart(2, '0')}` : `${rem}s`;
	}

	function recordValue(r: PersonalRecord): string {
		switch (r.kind) {
			case 'heaviest':
				return `${fmt(r.value)} lb`;
			case 'e1rm':
			case 'best_set':
				return `${Math.round(r.value).toLocaleString()} lb`;
			case 'most_reps':
				return `${r.value} reps`;
			case 'longest':
				return fmtDuration(r.value);
			case 'furthest':
				return `${fmt(r.value)} m`;
		}
	}

	/** The set behind the number. An estimate with nothing beside it invites
	 *  more trust than the formula has earned. */
	function recordSet(r: PersonalRecord): string {
		const s = r.set;
		const parts: string[] = [];
		if (s.weight_lb != null && s.reps != null) parts.push(`${fmt(s.weight_lb)} × ${s.reps}`);
		else if (s.reps != null) parts.push(`× ${s.reps}`);
		if (s.duration_s != null && r.kind !== 'longest') parts.push(fmtDuration(s.duration_s));
		parts.push(
			new Date(s.completed_at).toLocaleDateString(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			})
		);
		return parts.join(' · ');
	}
</script>

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

{#if history.length > 0}
	<div class="card block">
		<span class="label">Last time</span>
		<ul>
			{#each history[0].filter((s) => !s.is_warmup) as s, i (i)}
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

{#if records.length > 0}
	<div class="card block">
		<span class="label">Records</span>
		<ul>
			{#each records as r (r.kind)}
				<li class="hairline-row record-row">
					<span class="num set-label">{r.label}</span>
					<span class="record-right">
						<span class="num record-value">{recordValue(r)}</span>
						<span class="num record-set">{recordSet(r)}</span>
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

	.record-row {
		min-height: 44px;
		align-items: center;
	}

	.record-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
	}

	.record-value {
		font-family: $font-display;
		font-weight: 600;
		font-size: 17px;
	}

	.record-set {
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
