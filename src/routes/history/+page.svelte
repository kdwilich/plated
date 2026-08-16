<script lang="ts">
	let { data } = $props();

	function fmtDate(iso: string): string {
		return new Date(iso).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function duration(start: string, end: string | null): string {
		if (!end) return '';
		const m = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
		return `${m}m`;
	}
</script>

<svelte:head><title>Plateload — history</title></svelte:head>

<h1 class="display page-title">History</h1>

{#if data.workouts.length === 0}
	<p class="hint">Nothing yet. The first session writes the first line.</p>
{/if}

<ul>
	{#each data.workouts as w (w.id)}
		<li>
			<a class="card row" href="/history/{w.id}">
				<span class="row-main">
					<span class="row-name">{w.session_name ?? 'Freestyle'}</span>
					<span class="row-date num">{fmtDate(w.started_at)} · {duration(w.started_at, w.finished_at)}</span>
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

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-4;
	}

	.hint {
		font-size: 13px;
		color: $text-dim;
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: $space-3;
		padding: $space-3 $space-4;
		margin-bottom: $space-3;
	}

	.row-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.row-name {
		font-family: $font-display;
		font-weight: 600;
		font-size: 20px;
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
</style>
