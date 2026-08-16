<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import {
		clearActive,
		drainOutbox,
		enqueue,
		loadActive,
		saveActive,
		toPayload,
		type ActiveExercise,
		type ActiveSession
	} from '$lib/client/session';
	import { solve } from '$lib/training/plates';
	import { suggest, type Suggestion } from '$lib/training/progression';
	import { ramp } from '$lib/training/warmup';
	import type { LoggedSet, ProgressionKind } from '$lib/training/types';
	import PlateBar from '$lib/components/PlateBar.svelte';
	import ExerciseSearch from '$lib/components/ExerciseSearch.svelte';
	import type { ExerciseRow } from '$lib/server/catalog';

	let session = $state<ActiveSession | undefined>(undefined);
	let openId = $state<string | null>(null);
	let elapsed = $state('0:00');
	let adding = $state(false);
	let finishing = $state(false);

	// Per-exercise input state, keyed by exercise_id
	let weightInput = $state<Record<string, number>>({});
	let repsInput = $state<Record<string, number>>({});
	let durationInput = $state<Record<string, number>>({});

	onMount(() => {
		void (async () => {
			session = await loadActive();
			if (!session || session.finished_at) {
				await goto('/');
				return;
			}
			openId = session.exercises[0]?.exercise_id ?? null;
			if (openId) primeInputs(session.exercises[0]);
		})();
		const timer = setInterval(() => {
			if (!session) return;
			const s = Math.floor((Date.now() - Date.parse(session.started_at)) / 1000);
			elapsed = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
		}, 1000);
		return () => clearInterval(timer);
	});

	function gymFor(ex: ActiveExercise) {
		return {
			equipment: [],
			plates: session?.gym.plates ?? [],
			bars: [],
			dumbbell_step_lb: session?.gym.dumbbell_step_lb ?? 5,
			machine_step_lb: session?.gym.machine_step_lb ?? 10
		};
	}

	function suggestionFor(ex: ActiveExercise): Suggestion | null {
		return suggest(
			ex.history as LoggedSet[][],
			ex.rep_min ?? 8,
			ex.rep_max ?? 12,
			ex.progression as ProgressionKind,
			ex.increment_lb
		);
	}

	function lastLine(ex: ActiveExercise): string | null {
		const last = ex.history[0]?.filter((s) => !s.is_warmup);
		if (!last?.length) return null;
		if (ex.measurement === 'time' || ex.measurement === 'load_time') {
			return `LAST · ${last.map((s) => `${s.duration_s ?? 0}s`).join(', ')}`;
		}
		const w = Math.max(...last.map((s) => s.weight_lb ?? 0));
		return `LAST · ${w > 0 ? `${fmt(w)} × ` : ''}${last.map((s) => s.reps ?? 0).join(',')}`;
	}

	function primeInputs(ex: ActiveExercise) {
		if (weightInput[ex.exercise_id] !== undefined) return;
		const sugg = suggestionFor(ex);
		const lastWorking = ex.history[0]?.filter((s) => !s.is_warmup) ?? [];
		const lastWeight = lastWorking.length ? Math.max(...lastWorking.map((s) => s.weight_lb ?? 0)) : 0;
		const barDefault = isBarbell(ex) ? ex.bar_lb : 0;
		weightInput[ex.exercise_id] = sugg?.weight_lb ?? (lastWeight > 0 ? lastWeight : barDefault);
		repsInput[ex.exercise_id] = sugg?.target_reps ?? ex.rep_min ?? 8;
		durationInput[ex.exercise_id] = sugg?.target_duration_s ?? 30;
	}

	function toggle(ex: ActiveExercise) {
		openId = openId === ex.exercise_id ? null : ex.exercise_id;
		if (openId) primeInputs(ex);
	}

	const usesLoad = (ex: ActiveExercise) => ex.measurement === 'load_reps' || ex.measurement === 'load_time';
	const usesReps = (ex: ActiveExercise) => ex.measurement === 'load_reps' || ex.measurement === 'reps_only';
	const usesTime = (ex: ActiveExercise) =>
		ex.measurement === 'time' || ex.measurement === 'load_time' || ex.measurement === 'distance_time';
	const isBarbell = (ex: ActiveExercise) => ex.equipment === 'barbell' || ex.equipment === 'e-z curl bar';

	function setsFor(ex: ActiveExercise) {
		return (session?.sets ?? []).filter((s) => s.exercise_id === ex.exercise_id);
	}

	function bump(ex: ActiveExercise, dir: 1 | -1) {
		const step = ex.increment_lb > 0 ? ex.increment_lb : 5;
		weightInput[ex.exercise_id] = Math.max(0, (weightInput[ex.exercise_id] ?? 0) + dir * step);
	}

	async function logSet(ex: ActiveExercise, warmup = false, presetWeight?: number, presetReps?: number) {
		if (!session) return;
		session.sets.push({
			id: crypto.randomUUID(),
			exercise_id: ex.exercise_id,
			position: session.sets.length,
			weight_lb: usesLoad(ex) || presetWeight !== undefined ? (presetWeight ?? weightInput[ex.exercise_id] ?? null) : null,
			reps: usesReps(ex) || presetReps !== undefined ? (presetReps ?? repsInput[ex.exercise_id] ?? null) : null,
			duration_s: usesTime(ex) ? (durationInput[ex.exercise_id] ?? null) : null,
			distance_m: null,
			rir: null,
			is_warmup: warmup,
			completed_at: new Date().toISOString()
		});
		await saveActive(session);
	}

	async function undoSet(id: string) {
		if (!session) return;
		session.sets = session.sets.filter((s) => s.id !== id);
		await saveActive(session);
	}

	async function addExercise(row: ExerciseRow) {
		if (!session) return;
		adding = false;
		const res = await fetch(`/api/exercise-context?id=${encodeURIComponent(row.id)}`);
		if (!res.ok) return;
		const ex = (await res.json()) as ActiveExercise;
		if (session.exercises.some((e) => e.exercise_id === ex.exercise_id)) return;
		session.exercises.push(ex);
		await saveActive(session);
		openId = ex.exercise_id;
		primeInputs(ex);
	}

	async function finish() {
		if (!session || finishing) return;
		finishing = true;
		try {
			session.finished_at = new Date().toISOString();
			await enqueue(toPayload(session));
			await clearActive();
			await drainOutbox();
			await goto('/history');
		} finally {
			finishing = false;
		}
	}

	const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
</script>

<svelte:head><title>Plateload — session</title></svelte:head>

{#if session}
	<header class="session-head">
		<span class="label">{session.session_name}</span>
		<span class="num elapsed">{elapsed}</span>
	</header>

	{#each session.exercises as ex (ex.exercise_id)}
		{@const logged = setsFor(ex)}
		{@const working = logged.filter((s) => !s.is_warmup)}
		{@const open = openId === ex.exercise_id}
		{@const sugg = suggestionFor(ex)}
		<section class="exercise card" class:done={working.length >= ex.target_sets}>
			<button class="exercise-head" onclick={() => toggle(ex)}>
				<span class="head-main">
					<span class="exercise-name">{ex.name}</span>
					{#if lastLine(ex)}<span class="last num">{lastLine(ex)}</span>{/if}
				</span>
				<span class="progress num">{working.length}/{ex.target_sets}</span>
			</button>

			{#if open}
				<div class="body">
					{#if sugg?.note || sugg?.type === 'deload'}
						<p class="note" class:deload={sugg.type === 'deload'}>{sugg.note}</p>
					{/if}

					{#if usesLoad(ex)}
						<div class="hero">
							<button class="stepper num" onclick={() => bump(ex, -1)}>−{fmt(ex.increment_lb > 0 ? ex.increment_lb : 5)}</button>
							<div class="hero-weight">
								<input
									class="display weight"
									type="number"
									inputmode="decimal"
									min="0"
									step="any"
									bind:value={weightInput[ex.exercise_id]}
									style:width="{String(weightInput[ex.exercise_id] ?? 0).length + 0.7}ch"
									aria-label="Weight in pounds"
								/>
								<span class="unit label">lb</span>
							</div>
							<button class="stepper num" onclick={() => bump(ex, 1)}>+{fmt(ex.increment_lb > 0 ? ex.increment_lb : 5)}</button>
						</div>

						{#if isBarbell(ex)}
							{@const solution = solve(weightInput[ex.exercise_id] ?? 0, ex.bar_lb, session.gym.plates)}
							<div class="plates">
								<PlateBar perSide={solution.perSide} barLb={ex.bar_lb} />
								{#if !solution.exact}
									<span class="approx num">builds {fmt(solution.achievedLb)}</span>
								{/if}
							</div>
						{/if}

						{#if working.length === 0 && isBarbell(ex)}
							{@const warmups = ramp(weightInput[ex.exercise_id] ?? 0, ex.equipment, gymFor(ex), ex.bar_lb, ex.mechanic === 'compound')}
							{#if warmups.length > 0}
								<div class="warmups">
									<span class="label">Warmup</span>
									{#each warmups as w, i (i)}
										{@const done = logged.some((s) => s.is_warmup && s.weight_lb === w.weight_lb)}
										<button class="chip num" class:chip-done={done} onclick={() => logSet(ex, true, w.weight_lb, w.reps)}>
											{fmt(w.weight_lb)}×{w.reps}
										</button>
									{/each}
								</div>
							{/if}
						{/if}
					{/if}

					<div class="inputs">
						{#if usesReps(ex)}
							<label class="field">
								<span class="label">Reps{ex.rep_min != null ? ` (${ex.rep_min}–${ex.rep_max})` : ''}</span>
								<input class="num" type="number" inputmode="numeric" min="0" bind:value={repsInput[ex.exercise_id]} />
							</label>
						{/if}
						{#if usesTime(ex)}
							<label class="field">
								<span class="label">Seconds</span>
								<input class="num" type="number" inputmode="numeric" min="0" bind:value={durationInput[ex.exercise_id]} />
							</label>
						{/if}
						<button class="btn primary log" onclick={() => logSet(ex)}>Log set</button>
					</div>

					{#if logged.length > 0}
						<ul class="sets">
							{#each logged as s, i (s.id)}
								<li class="hairline-row">
									<span class="num set-label">{s.is_warmup ? 'W' : `SET ${logged.slice(0, i + 1).filter((x) => !x.is_warmup).length}`}</span>
									<span class="num set-value">
										{#if s.weight_lb != null}{fmt(s.weight_lb)}{/if}
										{#if s.reps != null}&nbsp;× {s.reps}{/if}
										{#if s.duration_s != null}&nbsp;{s.duration_s}s{/if}
									</span>
									<button class="undo" onclick={() => undoSet(s.id)} aria-label="Remove set">×</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</section>
	{/each}

	{#if adding}
		<div class="add-search">
			<ExerciseSearch onpick={addExercise} />
			<button class="btn quiet" onclick={() => (adding = false)}>Cancel</button>
		</div>
	{:else}
		<button class="btn add" onclick={() => (adding = true)}>+ Add exercise</button>
	{/if}

	<button class="btn primary finish" onclick={finish} disabled={finishing || session.sets.length === 0}>
		Finish session
	</button>
	<button
		class="btn danger discard"
		onclick={async () => {
			await clearActive();
			await goto('/');
		}}>Discard session</button
	>
{/if}

<style lang="scss">
	.session-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: $space-3;
		border-bottom: 1px solid $hairline;
		margin-bottom: $space-4;
	}

	.elapsed {
		font-size: 13px;
		color: $text-faint;
	}

	.exercise {
		margin-bottom: $space-3;

		&.done {
			border-left: 2px solid $ok;
		}
	}

	.exercise-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: $space-3;
		width: 100%;
		padding: $space-3 $space-4;
		text-align: left;
	}

	.head-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.exercise-name {
		font-size: 15px;
		font-weight: 500;
	}

	.last {
		font-size: 11px;
		color: $text-faint;
		letter-spacing: 0.04em;
	}

	.progress {
		font-size: 13px;
		color: $text-dim;
		white-space: nowrap;
	}

	.body {
		padding: 0 $space-4 $space-4;
		display: flex;
		flex-direction: column;
		gap: $space-4;
		border-top: 1px solid $hairline-faint;
		padding-top: $space-4;
	}

	.note {
		font-size: 13px;
		color: $text-dim;

		&.deload {
			color: $signal;
		}
	}

	.hero {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
	}

	.hero-weight {
		display: flex;
		align-items: baseline;
		gap: $space-2;
	}

	// Overrides the global input styling: the hero weight looks like a big
	// number, not a form field, but stays directly editable.
	input.weight {
		font-size: 56px;
		background: none;
		border: none;
		min-height: 0;
		padding: 0;
		max-width: 190px;
		text-align: center;
		-moz-appearance: textfield;
		appearance: textfield;

		&::-webkit-outer-spin-button,
		&::-webkit-inner-spin-button {
			-webkit-appearance: none;
		}

		&:focus {
			outline: none;
			border-bottom: 2px solid $signal;
		}
	}

	.stepper {
		min-width: $tap-target + 8px;
		min-height: $tap-target;
		border: 1px solid $hairline;
		border-radius: $radius;
		font-size: 15px;
		color: $text-dim;

		&:active {
			background: $hairline;
		}
	}

	.plates {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;
	}

	.approx {
		font-size: 11px;
		color: $signal;
	}

	.warmups {
		display: flex;
		align-items: center;
		gap: $space-2;
		flex-wrap: wrap;
	}

	.chip {
		padding: $space-2 $space-3;
		min-height: 36px;
		border: 1px solid $hairline;
		border-radius: $radius;
		font-size: 13px;
		color: $text-dim;

		&.chip-done {
			color: $text-faint;
			text-decoration: line-through;
		}
	}

	.inputs {
		display: flex;
		align-items: flex-end;
		gap: $space-3;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: $space-1;
		flex: 1;
	}

	.log {
		flex: 1.4;
	}

	.set-label {
		font-size: 11px;
		color: $text-faint;
		letter-spacing: 0.08em;
	}

	.set-value {
		font-size: 14px;
		margin-left: auto;
	}

	.undo {
		color: $text-faint;
		font-size: 18px;
		padding: 0 0 0 $space-4;
		min-height: $tap-target;
	}

	.add,
	.finish,
	.discard {
		width: 100%;
		margin-top: $space-3;
	}

	.add-search {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		margin-top: $space-3;
	}
</style>
