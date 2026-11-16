<script lang="ts">
	// Reads raw run rows and buckets them here, in the browser's zone, the way
	// the heatmap does. Miles only: nothing on this card is added to a set, a
	// rep or a pound, because they share no scale.
	import {
		biggestWeek,
		fmtClock,
		fmtMiles,
		fmtPace,
		longestRun,
		paceSecPerMi,
		spikeCap,
		spikeLine,
		standardRecords,
		weeklyMiles,
		type RunSet
	} from '$lib/training/running';

	let { rows, weeks = 12 }: { rows: RunSet[]; weeks?: number } = $props();

	const now = new Date();
	const weekly = $derived(weeklyMiles(rows, now, weeks));
	const peak = $derived(Math.max(...weekly, 0));
	const thisWeek = $derived(weekly[weekly.length - 1] ?? 0);
	const lastWeek = $derived(weekly[weekly.length - 2] ?? 0);
	const cap = $derived(spikeCap(rows, now));
	const records = $derived(standardRecords(rows));
	const longest = $derived(longestRun(rows));
	const biggest = $derived(biggestWeek(rows));

	const shortDate = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

	/** A bare YYYY-MM-DD is a local Monday; `new Date(str)` would read it as UTC. */
	function shortDay(day: string): string {
		const [y, m, d] = day.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const weekLabel = (i: number) =>
		i === weekly.length - 1 ? 'this week' : i === weekly.length - 2 ? 'last week' : `${weekly.length - 1 - i} weeks ago`;
</script>

{#if rows.length > 0}
	<p class="label section-label">Running</p>
	<section class="card running">
		<p class="week num">
			<span class="now">{thisWeek.toFixed(1)}</span> mi this week
			<span class="dim">· {lastWeek.toFixed(1)} last</span>
		</p>

		<ul class="bars" aria-label="Miles per week, last {weeks} weeks">
			{#each weekly as mi, i (i)}
				<li
					class="bar"
					class:current={i === weekly.length - 1}
					class:zero={mi === 0}
					style:height="{peak > 0 ? Math.max((mi / peak) * 100, mi > 0 ? 4 : 0) : 0}%"
					title="{mi.toFixed(1)} mi, {weekLabel(i)}"
				>
					<span class="sr">{mi.toFixed(1)} miles, {weekLabel(i)}</span>
				</li>
			{/each}
		</ul>
		<p class="axis num"><span>{weeks} weeks</span><span>peak {peak.toFixed(1)}</span></p>

		{#if cap}
			<p class="spike">{spikeLine(cap)}</p>
			<!-- Load-bearing: without it the line reads as a rule. -->
			<p class="caveat">One observational study, distance only. A suggestion.</p>
		{/if}

		<ul class="records">
			{#each records as r (r.key)}
				<li class="hairline-row rec">
					<span class="rec-name">{r.label}</span>
					<span class="rec-main">
						<span class="num rec-best">{fmtClock(r.time_s)} · {fmtPace(paceSecPerMi(r.distance_m, r.duration_s) ?? 0)}/mi</span>
						<span class="num rec-from">{fmtMiles(r.distance_m)} mi in {fmtClock(r.duration_s)} · {shortDate(r.started_at)}</span>
					</span>
				</li>
			{/each}
			{#if longest}
				<li class="hairline-row rec">
					<span class="rec-name">Longest</span>
					<span class="rec-main">
						<span class="num rec-best">{fmtMiles(longest.distance_m)} mi</span>
						<span class="num rec-from">{shortDate(longest.started_at)}</span>
					</span>
				</li>
			{/if}
			{#if biggest}
				<li class="hairline-row rec">
					<span class="rec-name">Biggest week</span>
					<span class="rec-main">
						<span class="num rec-best">{biggest.miles.toFixed(1)} mi</span>
						<span class="num rec-from">week of {shortDay(biggest.monday)}</span>
					</span>
				</li>
			{/if}
		</ul>
	</section>
{/if}

<style lang="scss">
	.section-label {
		margin-bottom: $space-2;
	}

	.running {
		padding: $space-4 $space-4 $space-2;
		margin-bottom: $space-5;
	}

	.week {
		font-size: 14px;
		color: $text;
	}

	.now {
		font-family: $font-display;
		font-weight: 600;
		font-size: 26px;
		line-height: 1;
	}

	.dim {
		color: $text-dim;
	}

	// Columns divide whatever width there is, like the heatmap, so twelve bars
	// fit a 320px phone without a scrollbar.
	.bars {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(0, 1fr);
		align-items: end;
		gap: 3px;
		height: 72px;
		margin-top: $space-3;
		border-bottom: 1px solid $hairline;
	}

	// Dim for the weeks behind, full for the one in progress. No plate colours:
	// those are data, and only for a barbell.
	.bar {
		background: $text-faint;
		border-radius: $radius $radius 0 0;

		&.current {
			background: $text;
		}
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.axis {
		display: flex;
		justify-content: space-between;
		margin-top: $space-1;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: $text-faint;
	}

	.spike {
		margin-top: $space-3;
		font-size: 14px;
		color: $text-dim;
	}

	.caveat {
		margin-top: $space-1;
		font-size: 11px;
		color: $text-faint;
		line-height: 1.4;
	}

	.records {
		margin-top: $space-3;
	}

	.rec {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
		min-height: $tap-target;

		&:last-child {
			border-bottom: 0;
		}
	}

	.rec-name {
		font-family: $font-display;
		font-weight: 600;
		font-size: 17px;
	}

	.rec-main {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
		min-width: 0;
	}

	.rec-best {
		font-size: 14px;
	}

	.rec-from {
		font-size: 11px;
		color: $text-faint;
	}
</style>
