<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();

	let editing = $state(false);
	// Two taps to delete: a stray thumb in a gym should not wipe a session.
	let confirmingId = $state<string | null>(null);

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

<header class="head">
	<h1 class="display page-title">History</h1>
	{#if data.workouts.length > 0}
		<button
			class="btn quiet edit-toggle"
			onclick={() => {
				editing = !editing;
				confirmingId = null;
			}}
		>
			{editing ? 'Done' : 'Edit'}
		</button>
	{/if}
</header>

{#if data.workouts.length === 0}
	<p class="hint">Nothing yet. The first session writes the first line.</p>
{/if}

<ul>
	{#each data.workouts as w (w.id)}
		<li class="entry">
			<a class="card row" class:shrunk={editing} href="/you/history/{w.id}">
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

			{#if editing}
				{#if confirmingId === w.id}
					<form
						method="POST"
						action="?/delete"
						use:enhance={() => {
							confirmingId = null;
							return async ({ update }) => update();
						}}
					>
						<input type="hidden" name="id" value={w.id} />
						<button class="side-btn confirm" type="submit" aria-label="Confirm delete">Delete?</button>
					</form>
					<button class="side-btn" onclick={() => (confirmingId = null)} aria-label="Cancel">×</button>
				{:else}
					<button class="side-btn danger" onclick={() => (confirmingId = w.id)} aria-label="Delete {w.session_name ?? 'Freestyle'}">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
							<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
						</svg>
					</button>
				{/if}
			{/if}
		</li>
	{/each}
</ul>

<style lang="scss">
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: $space-4;
	}

	.page-title {
		font-size: 30px;
	}

	.edit-toggle {
		min-height: 36px;
		padding: 0 $space-3;
		font-size: 14px;
	}

	.hint {
		font-size: 13px;
		color: $text-dim;
	}

	.entry {
		display: flex;
		align-items: stretch;
		gap: $space-2;
		margin-bottom: $space-3;
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: $space-3;
		padding: $space-3 $space-4;
		flex: 1;
		min-width: 0;
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

	.side-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: $tap-target;
		padding: 0 $space-2;
		border: 1px solid $hairline;
		border-radius: $radius;
		color: $text-dim;
		font-size: 14px;

		&.danger {
			color: $danger;
			border-color: $hairline;
		}

		&.confirm {
			color: $danger;
			border-color: $danger;
			white-space: nowrap;
			font-family: $font-display;
			font-weight: 600;
		}

		&:active {
			background: $hairline;
		}
	}
</style>
