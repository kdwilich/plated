<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	// A finished workout, and the ability to correct it. Editing does not write
	// to the server directly: it rebuilds the sync payload and drops it in the
	// same outbox a live session uses, because ingestWorkout replaces a
	// workout's sets wholesale. One write path, and a fix you make in a dead
	// zone reaches D1 whenever you next have signal.
	import { invalidateAll } from '$app/navigation';
	import ExercisePicker from '$lib/components/ExercisePicker.svelte';
	import { drainOutbox, enqueue } from '$lib/client/session';
	import { newSet, payloadFromEdits, toEditable, type EditableSet, type HistoryWorkout } from '$lib/client/edit';
	import { allowsNegativeLoad, usesLoad, usesReps, usesTime } from '$lib/training/measurement';
	import type { ExerciseRow } from '$lib/server/catalog';

	let { data } = $props();

	const workout = $derived(data.workout as unknown as HistoryWorkout & { session_name: string | null });

	let editing = $state(false);
	let saving = $state(false);
	let pending = $state(false);
	let error = $state<string | null>(null);
	let swapping = $state<string | null>(null);
	let draft = $state<EditableSet[]>([]);

	// Server rows while reading, the draft while editing. Both group the same
	// way, so the markup below has one shape to render.
	const sets = $derived(editing ? draft : toEditable(data.sets as unknown as Record<string, unknown>[]));

	// Groups carry INDICES into `sets`, not copies of the rows. Every read and
	// every binding then goes through the one array, so a checkbox that changes
	// is_warmup also renumbers the SET labels below it. Holding row references
	// here instead left the labels reading a stale group.
	const grouped = $derived.by(() => {
		const out: { exercise_id: string; name: string; measurement: string; idx: number[] }[] = [];
		sets.forEach((s, i) => {
			const last = out[out.length - 1];
			if (last && last.exercise_id === s.exercise_id) last.idx.push(i);
			else out.push({ exercise_id: s.exercise_id, name: s.exercise_name, measurement: s.measurement, idx: [i] });
		});
		return out;
	});

	const dirty = $derived(
		editing &&
			JSON.stringify(draft) !==
				JSON.stringify(toEditable(data.sets as unknown as Record<string, unknown>[]))
	);

	function startEdit() {
		draft = toEditable(data.sets as unknown as Record<string, unknown>[]);
		error = null;
		editing = true;
	}

	function cancel() {
		editing = false;
		swapping = null;
		draft = [];
	}

	function removeSet(id: string) {
		draft = draft.filter((s) => s.id !== id);
	}

	function addSetAfter(group: { idx: number[] }) {
		const at = group.idx[group.idx.length - 1];
		// Inserted next to its own exercise rather than appended, so the set
		// order still reads as the order you did them in.
		draft = [...draft.slice(0, at + 1), newSet(workout, draft[at]), ...draft.slice(at + 1)];
	}

	function swapExercise(exerciseId: string, row: ExerciseRow) {
		draft = draft.map((s) =>
			s.exercise_id === exerciseId
				? { ...s, exercise_id: row.id, exercise_name: row.name, measurement: row.measurement, equipment: row.equipment }
				: s
		);
		swapping = null;
	}

	async function save() {
		saving = true;
		error = null;
		try {
			await enqueue(payloadFromEdits(workout, draft));
			const { pending: left } = await drainOutbox();
			// Queued but unsent is a success, not a failure: it is stored locally
			// and will drain. Saying "saved" would be a lie, though.
			pending = left > 0;
			editing = false;
			draft = [];
			await invalidateAll();
		} catch {
			error = 'Could not save. Your edit is queued and will sync later.';
		} finally {
			saving = false;
		}
	}

	const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

	function loadLabel(s: EditableSet): string {
		if (s.weight_lb == null) return '';
		if (!allowsNegativeLoad(s.equipment, s.measurement)) return fmt(s.weight_lb);
		if (s.weight_lb === 0) return 'BW';
		return s.weight_lb > 0 ? `+${fmt(s.weight_lb)}` : fmt(s.weight_lb);
	}

	/** "SET 3" counts working sets only, so deleting or un-warming one renumbers. */
	function workingIndex(group: { idx: number[] }, upTo: number): number {
		return group.idx.slice(0, upTo + 1).filter((i) => !sets[i].is_warmup).length;
	}
</script>

<svelte:head><title>{APP_NAME} — workout</title></svelte:head>

<header class="detail-head">
	<div>
		<h1 class="display page-title">{workout.session_name ?? 'Freestyle'}</h1>
		<p class="meta num">
			{new Date(workout.started_at).toLocaleString(undefined, {
				weekday: 'long',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit'
			})}
		</p>
	</div>
	<button
		class="btn-sm label"
		aria-pressed={editing}
		onclick={editing ? cancel : startEdit}
		disabled={saving}
	>
		{editing ? 'Cancel' : 'Edit'}
	</button>
</header>

{#if editing}
	<p class="edit-hint">
		Corrections change your records too — a PR you set here can be retracted.
	</p>
{/if}

{#if pending && !editing}
	<p class="edit-hint queued">Saved on this device. It will reach the server when you have signal.</p>
{/if}

{#if error}
	<p class="edit-hint danger-text">{error}</p>
{/if}

{#each grouped as g (g.exercise_id + sets[g.idx[0]].id)}
	<div class="card block">
		{#if editing}
			<div class="group-head">
				<span class="exercise-name">{g.name}</span>
				<button
					class="link-btn label"
					onclick={() => (swapping = swapping === g.exercise_id ? null : g.exercise_id)}
				>
					{swapping === g.exercise_id ? 'Close' : 'Swap'}
				</button>
			</div>
			{#if swapping === g.exercise_id}
				<p class="swap-warning">
					Swapping moves this work to another exercise — volume and records move with it.
				</p>
				<ExercisePicker
					recommendFor={g.exercise_id}
					guideLinks={false}
					onpick={(row) => swapExercise(g.exercise_id, row)}
				/>
			{/if}
		{:else}
			<a class="exercise-name" href="/exercises/{g.exercise_id}">{g.name}</a>
		{/if}

		<ul>
			{#each g.idx as i, n (sets[i].id)}
				<li class="hairline-row set-row" class:warmup={sets[i].is_warmup && !editing}>
					<span class="num set-label">{sets[i].is_warmup ? 'W' : `SET ${workingIndex(g, n)}`}</span>
					{#if editing}
						<div class="edit-fields">
							{#if usesLoad(sets[i].measurement)}
								<input class="num cell" type="number" inputmode="decimal" step="any" aria-label="Weight" bind:value={draft[i].weight_lb} />
							{/if}
							{#if usesReps(sets[i].measurement)}
								<input class="num cell" type="number" inputmode="numeric" min="0" aria-label="Reps" bind:value={draft[i].reps} />
							{/if}
							{#if usesTime(sets[i].measurement)}
								<input class="num cell" type="number" inputmode="numeric" min="0" aria-label="Seconds" bind:value={draft[i].duration_s} />
							{/if}
							<label class="warm-toggle label">
								<input type="checkbox" aria-label="Warmup" bind:checked={draft[i].is_warmup} />
								W
							</label>
							<button class="drop" aria-label="Delete set" onclick={() => removeSet(sets[i].id)}>×</button>
						</div>
					{:else}
						<span class="num">
							{#if sets[i].weight_lb != null}{loadLabel(sets[i])}{/if}
							{#if sets[i].reps != null}&nbsp;× {sets[i].reps}{/if}
							{#if sets[i].duration_s != null}&nbsp;{sets[i].duration_s}s{/if}
						</span>
					{/if}
				</li>
			{/each}
		</ul>

		{#if editing}
			<button class="btn quiet add-set" onclick={() => addSetAfter(g)}>+ Add set</button>
		{/if}
	</div>
{/each}

{#if editing}
	<button class="btn primary save" onclick={save} disabled={saving || !dirty}>
		{saving ? 'Saving…' : 'Save changes'}
	</button>
{/if}

<style lang="scss">
	.detail-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: $space-3;
	}

	.page-title {
		font-size: 28px;
		margin-bottom: $space-1;
	}

	.meta {
		font-size: 12px;
		color: $text-dim;
		margin-bottom: $space-4;
	}

	.edit-hint {
		font-size: 12px;
		color: $signal;
		margin-bottom: $space-3;
	}

	.queued {
		color: $text-dim;
	}

	.danger-text {
		color: $text;
	}

	.block {
		padding: $space-3 $space-4;
		margin-bottom: $space-3;
	}

	.group-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: $space-3;
	}

	.exercise-name {
		display: block;
		font-size: 14px;
		font-weight: 500;
		margin-bottom: $space-2;
	}

	.link-btn {
		color: $text-dim;
		border-bottom: 1px solid $hairline;
	}

	.swap-warning {
		font-size: 12px;
		color: $signal;
		margin-bottom: $space-2;
	}

	.set-row {
		min-height: 34px;

		&.warmup {
			opacity: 0.5;
		}
	}

	.set-label {
		font-size: 11px;
		color: $text-faint;
	}

	.edit-fields {
		display: flex;
		align-items: center;
		gap: $space-2;
	}

	.cell {
		width: 4.5ch;
		min-height: $tap-target-sm;
		padding: 0 $space-2;
		border: 1px solid $hairline;
		border-radius: $radius;
		text-align: right;

		&:focus {
			outline: none;
			border-color: $signal;
		}
	}

	.warm-toggle {
		display: flex;
		align-items: center;
		gap: 4px;
		color: $text-faint;
		font-size: 11px;
	}

	.drop {
		min-width: $tap-target-sm;
		min-height: $tap-target-sm;
		color: $text-faint;
		font-size: 18px;
		line-height: 1;
	}

	.add-set {
		margin-top: $space-2;
		font-size: 13px;
	}

	.save {
		margin-top: $space-3;
	}
</style>
