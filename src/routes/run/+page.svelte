<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	import { goto } from '$app/navigation';
	import { drainOutbox, enqueue, type OutboxEntry } from '$lib/client/session';
	import { RUN_TYPES, fmtPace, paceSecPerMi, parseRunForm, runLabel, type RunType } from '$lib/training/running';
	import { localDay } from '$lib/training/streak';

	// A run is logged after the fact, so this is a form, not a session: no
	// clock, no start button, and nothing here touches the active lift in
	// IndexedDB. Submit builds a *finished* outbox entry and sends it down the
	// path a finished session takes. In a dead zone it waits like one.

	let date = $state(localDay(new Date()));
	let milesIn = $state('');
	let clockIn = $state('');
	let runType = $state<RunType>('easy');
	let effort = $state<number | null>(null);
	let note = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	const parsed = $derived(parseRunForm({ miles: milesIn, clock: clockIn }));
	const pace = $derived(parsed.ok ? paceSecPerMi(parsed.distance_m, parsed.duration_s) : null);
	// Only nag once both fields have been touched; an empty form is not wrong yet.
	const showError = $derived(!parsed.ok && milesIn !== '' && clockIn !== '');

	/** Today keeps the wall clock, so two runs in a day order correctly. A
	 *  backdated run sits at local noon: `new Date('YYYY-MM-DD')` would parse as
	 *  UTC midnight and land on yesterday evening west of Greenwich, and the
	 *  heatmap buckets by local day. */
	function startedAt(day: string): Date {
		if (day === localDay(new Date())) return new Date();
		const [y, m, d] = day.split('-').map(Number);
		return new Date(y, m - 1, d, 12);
	}

	function bumpEffort(dir: 1 | -1) {
		const next = (effort ?? (dir > 0 ? 0 : 11)) + dir;
		effort = next < 1 || next > 10 ? null : next;
	}

	async function save() {
		if (!parsed.ok || saving) return;
		saving = true;
		error = null;
		try {
			const started = startedAt(date);
			const finished = new Date(started.getTime() + parsed.duration_s * 1000);
			const id = crypto.randomUUID();
			const entry: OutboxEntry = {
				workout: {
					id,
					routine_session_id: null,
					started_at: started.toISOString(),
					finished_at: finished.toISOString(),
					notes: note.trim() || null,
					run_type: runType,
					effort
				},
				sets: [
					{
						id: crypto.randomUUID(),
						exercise_id: 'run',
						position: 0,
						weight_lb: null,
						reps: null,
						duration_s: parsed.duration_s,
						distance_m: parsed.distance_m,
						rir: null,
						is_warmup: false,
						completed_at: finished.toISOString()
					}
				]
			};
			await enqueue(entry);
			const { pending } = await drainOutbox();
			// The detail page reads from the server; if the run is still in the
			// outbox there is nothing there yet, so land on Train instead.
			await goto(pending > 0 ? '/' : `/you/history/${id}`);
		} catch {
			error = 'Could not save the run. It is not lost: try again.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>{APP_NAME} — log a run</title></svelte:head>

<h1 class="display page-title">Log a run</h1>

<form class="card" onsubmit={(e) => { e.preventDefault(); void save(); }}>
	<label class="field">
		<span class="label">Date</span>
		<input class="num" type="date" bind:value={date} max={localDay(new Date())} />
	</label>

	<div class="pair">
		<label class="field">
			<span class="label">Miles</span>
			<input class="num" type="text" inputmode="decimal" placeholder="3.10" bind:value={milesIn} />
		</label>
		<label class="field">
			<span class="label">Time</span>
			<input class="num" type="text" inputmode="numeric" placeholder="24:30" bind:value={clockIn} />
		</label>
	</div>

	<p class="pace num" aria-live="polite">
		{#if pace !== null}{fmtPace(pace)}/mi{:else if showError && !parsed.ok}{parsed.error}{:else}&nbsp;{/if}
	</p>

	<div class="chips" role="radiogroup" aria-label="Run type">
		{#each RUN_TYPES as t (t)}
			<button type="button" class="chip" class:on={runType === t} role="radio" aria-checked={runType === t} onclick={() => (runType = t)}>
				{runLabel(t)}
			</button>
		{/each}
	</div>

	<div class="field effort">
		<span class="label">Effort <span class="hint">(1–10, optional)</span></span>
		<div class="stepper">
			<button type="button" class="step" onclick={() => bumpEffort(-1)} aria-label="Lower effort">−</button>
			<span class="num value">{effort ?? '—'}</span>
			<button type="button" class="step" onclick={() => bumpEffort(1)} aria-label="Raise effort">+</button>
		</div>
	</div>

	<label class="field">
		<span class="label">Note</span>
		<input type="text" placeholder="Route, surface, how it felt" bind:value={note} />
	</label>

	{#if error}<p class="error">{error}</p>{/if}

	<button class="btn primary" type="submit" disabled={!parsed.ok || saving}>
		{saving ? 'Saving…' : 'Save run'}
	</button>
</form>

<style lang="scss">
	// Tokens arrive through vite.config.ts additionalData; no @use needed.
	.page-title { font-size: 30px; margin-bottom: $space-4; } // as every other page scopes it
	form { display: flex; flex-direction: column; gap: $space-4; padding: $space-4; }
	.field { display: flex; flex-direction: column; gap: $space-1; }
	.field input { min-height: $tap-target; }
	.pair { display: grid; grid-template-columns: 1fr 1fr; gap: $space-3; }
	.pace { min-height: 1.5em; color: $text-dim; margin: 0; }
	.chips { display: flex; flex-wrap: wrap; gap: $space-2; }
	.chip {
		min-height: $tap-target-sm;
		padding: 0 $space-3;
		border: 1px solid $hairline;
		border-radius: $radius;
		background: $surface;
		color: $text-dim;
		&.on { color: $text; border-color: $text; }
	}
	.stepper { display: flex; align-items: center; gap: $space-3; }
	.step { width: $tap-target; height: $tap-target; border: 1px solid $hairline; border-radius: $radius; background: $surface; color: $text; font-size: 1.25rem; }
	.value { min-width: 2ch; text-align: center; font-size: 1.5rem; }
	.error { color: $danger; margin: 0; }
</style>
