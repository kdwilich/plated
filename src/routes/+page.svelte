<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { loadActive, saveActive, type ActiveSession } from '$lib/client/session';

	let { data } = $props();

	let resumable = $state.raw<ActiveSession | undefined>(undefined);
	let starting = $state(false);

	onMount(async () => {
		resumable = await loadActive();
	});

	async function start(routineSessionId: string | null) {
		if (starting) return;
		starting = true;
		try {
			const res = await fetch('/api/session-start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ routine_session_id: routineSessionId })
			});
			if (!res.ok) throw new Error('session start failed');
			const session = (await res.json()) as ActiveSession;
			await saveActive(session);
			await goto('/workout');
		} finally {
			starting = false;
		}
	}

	function sessionStaleness(groups: string[]): number | null {
		const days = groups.map((g) => data.staleness[g]).filter((d) => d !== undefined);
		if (days.length === 0) return null;
		return Math.min(...days);
	}
</script>

<svelte:head><title>Plateload</title></svelte:head>

{#if resumable && !resumable.finished_at}
	<a class="resume card" href="/workout">
		<span class="label">Session in progress</span>
		<span class="resume-name display">{resumable.session_name}</span>
		<span class="hint">Tap to resume — {resumable.sets.length} sets logged</span>
	</a>
{/if}

{#if data.routine}
	<p class="label routine-label">{data.routine.name}</p>

	{#each data.routine.sessions as s (s.id)}
		{@const stale = sessionStaleness(s.groups)}
		<button class="session card" class:next={s.position === data.next} onclick={() => start(s.id)} disabled={starting}>
			<span class="session-main">
				{#if s.position === data.next}<span class="next-tag">Next up</span>{/if}
				<span class="session-name display">{s.name}</span>
				<span class="session-meta num">{s.exercise_count} exercises · {s.groups.join(', ') || '—'}</span>
			</span>
			{#if stale !== null}
				<span class="stale num" class:overdue={stale >= 7}>{stale}d</span>
			{:else}
				<span class="stale num fresh">new</span>
			{/if}
		</button>
	{/each}
{:else}
	<div class="empty card">
		<p class="display empty-title">No routine yet</p>
		<p class="hint">Generate a split from what your gym actually has, then tweak it to taste.</p>
		<a class="btn primary" href="/routines/generate">Generate a routine</a>
	</div>
{/if}

<button class="btn freestyle" onclick={() => start(null)} disabled={starting}>Start freestyle session</button>

<style lang="scss">
	.resume {
		display: flex;
		flex-direction: column;
		gap: $space-1;
		padding: $space-4;
		margin-bottom: $space-5;
		border-left: 3px solid $signal;
	}

	.resume-name {
		font-size: 28px;
	}

	.hint {
		font-size: 13px;
		color: $text-dim;
	}

	.routine-label {
		margin-bottom: $space-3;
	}

	.session {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
		width: 100%;
		padding: $space-4;
		margin-bottom: $space-3;
		text-align: left;

		&.next {
			border-color: $text-faint;
		}
	}

	.session-main {
		display: flex;
		flex-direction: column;
		gap: $space-1;
	}

	.next-tag {
		font-family: $font-mono;
		font-size: 10px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: $signal;
	}

	.session-name {
		font-size: 26px;
	}

	.session-meta {
		font-size: 11px;
		color: $text-faint;
	}

	.stale {
		font-size: 15px;
		color: $text-dim;

		&.overdue {
			color: $signal;
		}

		&.fresh {
			color: $text-faint;
		}
	}

	.empty {
		display: flex;
		flex-direction: column;
		gap: $space-3;
		padding: $space-5 $space-4;
		margin-bottom: $space-4;

		.empty-title {
			font-size: 26px;
		}
	}

	.freestyle {
		width: 100%;
		margin-top: $space-4;
	}
</style>
