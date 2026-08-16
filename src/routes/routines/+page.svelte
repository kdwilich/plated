<script lang="ts">
	import { enhance } from '$app/forms';
	import ExercisePicker from '$lib/components/ExercisePicker.svelte';
	import type { ExerciseRow } from '$lib/server/catalog';

	let { data } = $props();

	let editingId = $state<string | null>(null);
	let addingTo = $state<string | null>(null);
	let swapping = $state<string | null>(null);

	let addForm: HTMLFormElement | undefined = $state();
	let swapForm: HTMLFormElement | undefined = $state();
	let pickedExercise = $state<ExerciseRow | null>(null);

	function pickForAdd(ex: ExerciseRow) {
		pickedExercise = ex;
		queueMicrotask(() => addForm?.requestSubmit());
	}

	function pickForSwap(ex: ExerciseRow) {
		pickedExercise = ex;
		queueMicrotask(() => swapForm?.requestSubmit());
	}
</script>

<svelte:head><title>Plateload — routine</title></svelte:head>

{#if data.routine}
	<header class="head">
		<h1 class="display">{data.routine.name}</h1>
		<a class="btn quiet" href="/routines/generate">Regenerate</a>
	</header>
	<p class="label profile-line">
		{data.profiles.find((p) => p.key === data.routine?.profile_key)?.name ?? data.routine.profile_key}
		· <a href="/gym">gym setup</a>
	</p>

	{#each data.routine.sessions as session (session.id)}
		<section class="session">
			<h2 class="label">{session.name}</h2>
			<div class="card">
				{#each session.exercises as re (re.id)}
					<div class="row">
						{#if editingId === re.id}
							<div class="edit-form">
								<span class="edit-name">{re.exercise.name}</span>
								<form
									method="POST"
									action="?/update"
									class="edit-inner"
									use:enhance={() => {
										editingId = null;
										return async ({ update }) => update();
									}}
								>
									<input type="hidden" name="id" value={re.id} />
									<div class="edit-fields">
										<label><span class="label">Sets</span><input class="num" type="number" name="target_sets" value={re.target_sets} min="1" max="10" /></label>
										<label><span class="label">Min</span><input class="num" type="number" name="rep_min" value={re.rep_min} min="1" max="30" /></label>
										<label><span class="label">Max</span><input class="num" type="number" name="rep_max" value={re.rep_max} min="1" max="30" /></label>
									</div>
									<button class="btn primary" type="submit">Save</button>
								</form>
								<div class="edit-actions">
									<button class="btn quiet" type="button" onclick={() => (swapping = swapping === re.id ? null : re.id)}>Swap</button>
									<form
										method="POST"
										action="?/remove"
										use:enhance={() => {
											editingId = null;
											return async ({ update }) => update();
										}}
									>
										<input type="hidden" name="id" value={re.id} />
										<button class="btn danger" type="submit">Remove</button>
									</form>
								</div>
								{#if swapping === re.id}
									<ExercisePicker
										placeholder="Swap with…"
										recommendFor={re.exercise_id}
										sessionIds={session.exercises.map((e) => e.exercise_id)}
										onpick={pickForSwap}
									/>
									<form
										method="POST"
										action="?/swap"
										bind:this={swapForm}
										use:enhance={() => {
											swapping = null;
											editingId = null;
											return async ({ update }) => update();
										}}
									>
										<input type="hidden" name="id" value={re.id} />
										<input type="hidden" name="exercise_id" value={pickedExercise?.id ?? ''} />
									</form>
								{/if}
							</div>
						{:else}
							<button class="row-btn" onclick={() => (editingId = re.id)}>
								<span class="row-name">{re.exercise.name}</span>
								<span class="row-rx num">{re.target_sets}×{re.rep_min}–{re.rep_max}</span>
							</button>
						{/if}
					</div>
				{/each}

				{#if addingTo === session.id}
					<div class="add-area">
						<ExercisePicker
							sessionIds={session.exercises.map((e) => e.exercise_id)}
							onpick={pickForAdd}
						/>
						<form
							method="POST"
							action="?/add"
							bind:this={addForm}
							use:enhance={() => {
								addingTo = null;
								return async ({ update }) => update();
							}}
						>
							<input type="hidden" name="session_id" value={session.id} />
							<input type="hidden" name="exercise_id" value={pickedExercise?.id ?? ''} />
						</form>
						<button class="btn quiet" onclick={() => (addingTo = null)}>Cancel</button>
					</div>
				{:else}
					<button class="add-btn" onclick={() => (addingTo = session.id)}>+ Add exercise</button>
				{/if}
			</div>
		</section>
	{/each}
{:else}
	<div class="card empty">
		<p class="display empty-title">No routine yet</p>
		<a class="btn primary" href="/routines/generate">Generate one</a>
	</div>
{/if}

<style lang="scss">
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;

		h1 {
			font-size: 30px;
		}
	}

	.profile-line {
		margin: $space-1 0 $space-4;

		a {
			color: $text-dim;
			text-decoration: underline;
		}
	}

	.session {
		margin-bottom: $space-5;

		h2 {
			margin-bottom: $space-2;
		}
	}

	.row {
		border-bottom: 1px solid $hairline-faint;

		&:last-of-type {
			border-bottom: none;
		}
	}

	.row-btn {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: $space-3;
		width: 100%;
		min-height: $tap-target;
		padding: $space-2 $space-4;
		text-align: left;
	}

	.row-name {
		font-size: 14px;
	}

	.row-rx {
		font-size: 13px;
		color: $text-dim;
		white-space: nowrap;
	}

	.edit-form {
		display: flex;
		flex-direction: column;
		gap: $space-3;
		padding: $space-3 $space-4;
		background: $surface-raised;
	}

	.edit-inner {
		display: flex;
		flex-direction: column;
		gap: $space-3;
	}

	.edit-name {
		font-size: 14px;
		font-weight: 500;
	}

	.edit-fields {
		display: flex;
		gap: $space-3;

		label {
			display: flex;
			flex-direction: column;
			gap: $space-1;
			flex: 1;
		}
	}

	.edit-actions {
		display: flex;
		gap: $space-2;

		.btn {
			flex: 1;
		}
	}

	.add-btn {
		width: 100%;
		min-height: $tap-target;
		color: $text-faint;
		font-size: 13px;
	}

	.add-area {
		padding: $space-3 $space-4;
		display: flex;
		flex-direction: column;
		gap: $space-3;
	}

	.empty {
		padding: $space-5 $space-4;
		display: flex;
		flex-direction: column;
		gap: $space-3;

		.empty-title {
			font-size: 26px;
		}
	}
</style>
