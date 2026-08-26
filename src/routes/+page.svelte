<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { hasLoggedWork, loadActive, saveActive, workSummary, type ActiveSession } from '$lib/client/session';

	let { data } = $props();

	let resumable = $state.raw<ActiveSession | undefined>(undefined);
	let starting = $state(false);
	// A session picked while another one is live and holds work. It waits here
	// until the warning is answered, because starting it destroys the live one.
	let pending = $state.raw<{ id: string | null; name: string } | null>(null);

	onMount(async () => {
		resumable = await loadActive(data.user?.id);
	});

	/**
	 * Every path into a new session goes through here. A live workout with sets
	 * in it is not thrown away on a stray tap; one that was started and never
	 * touched is, because there is nothing to lose and a prompt would be noise.
	 */
	function choose(routineSessionId: string | null, name: string) {
		if (starting) return;
		if (hasLoggedWork(resumable)) {
			pending = { id: routineSessionId, name };
			return;
		}
		void start(routineSessionId);
	}

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
			pending = null;
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

<svelte:window onkeydown={(e) => e.key === 'Escape' && (pending = null)} />

<svelte:head><title>{APP_NAME}</title></svelte:head>

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
		<button class="session card" class:next={s.position === data.next} onclick={() => choose(s.id, s.name)} disabled={starting}>
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

<button class="btn freestyle" onclick={() => choose(null, 'Freestyle')} disabled={starting}>Start freestyle session</button>

{#if pending && resumable}
	{@const next = pending}
	<div class="backdrop" role="presentation" onclick={() => (pending = null)}></div>
	<div class="confirm card" role="alertdialog" aria-modal="true" aria-labelledby="replace-head">
		<p class="display confirm-title" id="replace-head">Replace this workout?</p>
		<p class="hint">
			{resumable.session_name} is in progress with {workSummary(resumable)} logged. Starting
			{next.name} throws that away — it is not saved to your history.
		</p>
		<button class="btn danger" disabled={starting} onclick={() => start(next.id)}>
			Start {next.name}
		</button>
		<button class="btn quiet" disabled={starting} onclick={() => (pending = null)}>Cancel</button>
	</div>
{/if}

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

	// Sits above everything on this screen. Centred rather than a bottom sheet
	// like the guide: this one interrupts, and a thumb reaching for the split
	// it just tapped should not land on Start.
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgba(0, 0, 0, 0.6);
	}

	.confirm {
		position: fixed;
		z-index: 31;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: calc(100% - #{$space-4} * 2);
		max-width: 420px;
		display: flex;
		flex-direction: column;
		gap: $space-3;
		padding: $space-4;
		background: $ground;
	}

	.confirm-title {
		font-size: 26px;
	}
</style>
