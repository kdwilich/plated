<script lang="ts">
	import GuideLink from '$lib/components/GuideLink.svelte';
	import { plateEquivalent } from '$lib/training/records';
	import { DISPLAY_GROUPS, muscleGroup } from '$lib/training/volume';
	import type { HeadlineRecord } from '$lib/server/stats';

	let { data } = $props();

	const LOADED = new Set(['load_reps', 'load_time']);
	const RECENT_DAYS = 30;

	const recentCount = $derived(
		data.records.filter((r) => Date.now() - Date.parse(r.completed_at) < RECENT_DAYS * 86_400_000)
			.length
	);

	/** Exercises land under every group their primary muscles touch. Anything
	 *  unpatterned goes to Other rather than vanishing, which is what the
	 *  volume scoring does to it. */
	const byGroup = $derived.by(() => {
		const out: Record<string, HeadlineRecord[]> = {};
		for (const r of data.records) {
			const groups = new Set<string>();
			if (r.movement_pattern) {
				for (const m of r.primary_muscles) {
					const g = muscleGroup(m);
					if (g) groups.add(g);
				}
			}
			if (groups.size === 0) groups.add('other');
			for (const g of groups) (out[g] ??= []).push(r);
		}
		// Loaded lifts rank against each other by estimate. A dead hang and a
		// squat share no scale, so the rest follow by recency instead of being
		// forced onto one.
		for (const list of Object.values(out)) {
			list.sort((a, b) => {
				const al = LOADED.has(a.measurement);
				const bl = LOADED.has(b.measurement);
				if (al !== bl) return al ? -1 : 1;
				if (al) return b.best - a.best;
				return Date.parse(b.completed_at) - Date.parse(a.completed_at);
			});
		}
		return out;
	});

	const groups = $derived([...DISPLAY_GROUPS, 'other'] as string[]);

	const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

	function fmtDuration(s: number): string {
		const m = Math.floor(s / 60);
		const rem = Math.round(s % 60);
		return m > 0 ? `${m}:${String(rem).padStart(2, '0')}` : `${rem}s`;
	}

	function headline(r: HeadlineRecord): string {
		switch (r.measurement) {
			case 'load_reps':
				return `${fmt(r.weight_lb ?? 0)} × ${r.reps} · ${Math.round(r.best)} est.`;
			case 'load_time':
				return `${fmt(r.weight_lb ?? 0)} lb`;
			case 'reps_only':
				return `${r.reps} reps`;
			case 'time':
				return fmtDuration(r.duration_s ?? 0);
			case 'distance_time':
				return `${fmt(r.distance_m ?? 0)} m`;
			default:
				return '';
		}
	}

	const shortDate = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<svelte:head><title>Plateload — stats</title></svelte:head>

<h1 class="display page-title">Stats</h1>

{#if recentCount > 0}
	<p class="fresh num">
		{recentCount} new record{recentCount === 1 ? '' : 's'} in the last {RECENT_DAYS} days
	</p>
{/if}

<section class="card block totals">
	<div class="grid">
		<div>
			<span class="stat num">{data.totals.workouts.toLocaleString()}</span>
			<span class="label">workouts</span>
		</div>
		<div>
			<span class="stat num">{data.totals.sets.toLocaleString()}</span>
			<span class="label">sets</span>
		</div>
		<div>
			<span class="stat num">{data.totals.reps.toLocaleString()}</span>
			<span class="label">reps</span>
		</div>
		<div>
			<span class="stat num">{Math.round(data.totals.volume_lb).toLocaleString()}</span>
			<span class="label">lb lifted</span>
		</div>
	</div>
	<p class="plates num">
		That is {plateEquivalent(data.totals.volume_lb).toLocaleString()} forty-fives.
	</p>
	<!-- Load-bearing, not decoration: a number that silently ignores every
	     bodyweight lift looks authoritative sitting next to a heatmap. -->
	<p class="caveat">Bodyweight lifts log no weight, so pull-ups and dips count zero here.</p>
</section>

<p class="label section-label">Sets by muscle group</p>
<div class="table-head num">
	<span></span><span>7d</span><span>28d</span><span>plan</span>
</div>

{#each groups as g (g)}
	{@const lifts = byGroup[g] ?? []}
	{@const a7 = data.last7[g]}
	{@const a28 = data.last28[g]}
	{#if lifts.length > 0 || a7 || a28 || data.planned[g]}
		<details class="card group">
			<summary>
				<span class="group-name">{g}</span>
				<span class="num n">{a7 ?? '—'}</span>
				<span class="num n dim">{a28 ?? '—'}</span>
				<span class="num n dim">{g === 'other' ? '—' : (data.planned[g] ?? '—')}</span>
			</summary>
			{#if lifts.length === 0}
				<p class="hint empty">Nothing logged for this group yet.</p>
			{:else}
				<ul>
					{#each lifts as r (r.exercise_id)}
						<li class="hairline-row lift">
							<span class="lift-main">
								<span class="lift-name">{r.name}</span>
								<span class="num lift-best">{headline(r)} · {shortDate(r.completed_at)}</span>
							</span>
							<GuideLink exerciseId={r.exercise_id} name={r.name} size={16} />
						</li>
					{/each}
				</ul>
			{/if}
		</details>
	{/if}
{/each}

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-3;
	}

	.fresh {
		font-family: $font-display;
		font-weight: 600;
		font-size: 15px;
		color: $signal;
		margin-bottom: $space-3;
	}

	.block {
		padding: $space-4;
		margin-bottom: $space-5;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: $space-4;
	}

	.grid div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat {
		font-family: $font-display;
		font-weight: 600;
		font-size: 26px;
		line-height: 1;
	}

	.plates {
		margin-top: $space-4;
		font-size: 14px;
		color: $text-dim;
	}

	.caveat {
		margin-top: $space-1;
		font-size: 11px;
		color: $text-faint;
		line-height: 1.4;
	}

	.section-label {
		margin-bottom: $space-2;
	}

	.table-head {
		display: grid;
		grid-template-columns: 1fr 44px 44px 44px;
		gap: $space-2;
		padding: 0 $space-4 $space-1;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: $text-faint;
	}

	.group {
		margin-bottom: $space-2;
	}

	summary {
		display: grid;
		grid-template-columns: 1fr 44px 44px 44px;
		gap: $space-2;
		align-items: center;
		min-height: $tap-target;
		padding: 0 $space-4;
		cursor: pointer;
		list-style: none;

		&::-webkit-details-marker {
			display: none;
		}
	}

	.group-name {
		font-family: $font-display;
		font-weight: 600;
		font-size: 17px;
		text-transform: capitalize;
	}

	.n {
		text-align: right;
		font-size: 14px;

		&.dim {
			color: $text-dim;
		}
	}

	.lift {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-2;
		min-height: $tap-target;
		padding-left: $space-4;
	}

	.lift-main {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.lift-name {
		font-size: 14px;
	}

	.lift-best {
		font-size: 11px;
		color: $text-faint;
	}

	.empty {
		padding: 0 $space-4 $space-3;
		font-size: 12px;
		color: $text-faint;
	}
</style>
