<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	import Heatmap from '$lib/components/Heatmap.svelte';
	import { bucketByLocalDay, currentStreak } from '$lib/training/streak';

	let { data } = $props();

	// Bucketed here, not on the server: the browser is the only party that
	// knows what day the lifter thinks it is.
	const days = $derived(bucketByLocalDay(data.days));
	const streak = $derived(currentStreak(days, new Date()));

	function fmtDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head><title>{APP_NAME} — you</title></svelte:head>

<h1 class="display page-title">You</h1>

<section class="card block">
	<div class="cadence">
		<span class="label">Last 26 weeks</span>
		<span class="num streak">
			{#if streak > 0}
				{streak} week{streak === 1 ? '' : 's'} in a row
			{:else}
				{days.length} day{days.length === 1 ? '' : 's'} trained
			{/if}
		</span>
	</div>
	<Heatmap {days} />
</section>

<p class="label section-label">Recent</p>
{#if data.workouts.length === 0}
	<p class="hint">Nothing yet. The first session writes the first line.</p>
{/if}
<ul class="recent">
	{#each data.workouts as w (w.id)}
		<li>
			<a class="card row" href="/you/history/{w.id}">
				<span class="row-main">
					<span class="row-name">{w.session_name ?? 'Freestyle'}</span>
					<span class="row-date num">{fmtDate(w.started_at)}</span>
				</span>
				<span class="row-stats num">
					{w.set_count} sets
					{#if w.total_volume_lb > 0}
						· {Math.round(w.total_volume_lb).toLocaleString()} lb
					{/if}
				</span>
			</a>
		</li>
	{/each}
</ul>

<nav class="links">
	<a class="card link-row" href="/you/stats"><span>Stats</span><span class="chev">›</span></a>
	<a class="card link-row" href="/you/history"><span>All workouts</span><span class="chev">›</span></a>
	<a class="card link-row" href="/gym"><span>Gym setup</span><span class="chev">›</span></a>
	<a class="card link-row" href="/you/account"><span>Account</span><span class="chev">›</span></a>
</nav>

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-4;
	}

	.block {
		padding: $space-3 $space-4;
		margin-bottom: $space-5;
	}

	.cadence {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: $space-3;
	}

	.streak {
		font-family: $font-display;
		font-weight: 600;
		font-size: 15px;
	}

	.section-label {
		margin-bottom: $space-2;
	}

	.hint {
		font-size: 13px;
		color: $text-dim;
	}

	.recent li {
		margin-bottom: $space-2;
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: $space-3;
		padding: $space-3 $space-4;
	}

	.row-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row-name {
		font-family: $font-display;
		font-weight: 600;
		font-size: 18px;
	}

	.row-date {
		font-size: 11px;
		color: $text-faint;
	}

	.row-stats {
		font-size: 12px;
		color: $text-dim;
		white-space: nowrap;
	}

	.links {
		margin-top: $space-5;
	}

	.link-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: $tap-target;
		padding: 0 $space-4;
		margin-bottom: $space-2;
		font-family: $font-display;
		font-weight: 600;
		font-size: 17px;
	}

	.chev {
		color: $text-faint;
	}
</style>
