<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	import { enhance } from '$app/forms';
	import ExercisePicker from '$lib/components/ExercisePicker.svelte';
	import { isUnderTarget } from '$lib/training/volume';
	import type { ExerciseRow } from '$lib/server/catalog';

	let { data, form } = $props();

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

	// Names save on blur. A name is not worth a confirm step, and an accidental
	// save costs nothing — but an empty one would, so blank reverts.
	// `saved` is passed rather than read off input.defaultValue: Svelte sets
	// value as a property, so defaultValue keeps whatever SSR rendered and
	// goes stale the moment you rename anything.
	function saveName(e: Event & { currentTarget: HTMLInputElement }, saved: string) {
		const input = e.currentTarget;
		if (!input.value.trim()) {
			input.value = saved;
			return;
		}
		if (input.value === saved) return;
		input.form?.requestSubmit();
	}

	function nameKeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }, saved: string) {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.currentTarget.blur();
		} else if (e.key === 'Escape') {
			e.currentTarget.value = saved;
			e.currentTarget.blur();
		}
	}

	const total = $derived(data.routine.sessions.reduce((n, s) => n + s.exercises.length, 0));
	const profile = $derived(data.profiles.find((p) => p.key === data.routine.profile_key));
</script>

<svelte:head><title>{APP_NAME} — {data.routine.name}</title></svelte:head>

<header class="head">
	<form method="POST" action="?/rename" use:enhance={() => ({ update }) => update({ reset: false })}>
		<input
			class="display title-input"
			name="name"
			value={data.routine.name}
			aria-label="Routine name"
			onblur={(e) => saveName(e, data.routine.name)}
			onkeydown={(e) => nameKeydown(e, data.routine.name)}
		/>
	</form>
	{#if data.routine.is_active}
		<span class="active-tag">Active</span>
	{/if}
</header>

<p class="label profile-line">
	{profile?.name ?? data.routine.profile_key} · <a href="/gym">gym setup</a> ·
	<a href="/routines">all routines</a>
</p>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#each data.routine.sessions as session, i (session.id)}
	<section class="session">
		<div class="session-head">
			<form
				method="POST"
				action="?/rename_session"
				use:enhance={() => ({ update }) => update({ reset: false })}
			>
				<input type="hidden" name="id" value={session.id} />
				<input
					class="label day-input"
					name="name"
					value={session.name}
					aria-label="Day name"
					onblur={(e) => saveName(e, session.name)}
					onkeydown={(e) => nameKeydown(e, session.name)}
				/>
			</form>
			<div class="day-actions">
				<form method="POST" action="?/move_session" use:enhance>
					<input type="hidden" name="id" value={session.id} />
					<input type="hidden" name="dir" value="up" />
					<button class="icon" type="submit" aria-label="Move {session.name} up" disabled={i === 0}>↑</button>
				</form>
				<form method="POST" action="?/move_session" use:enhance>
					<input type="hidden" name="id" value={session.id} />
					<input type="hidden" name="dir" value="down" />
					<button
						class="icon"
						type="submit"
						aria-label="Move {session.name} down"
						disabled={i === data.routine.sessions.length - 1}>↓</button
					>
				</form>
				<form method="POST" action="?/remove_session" use:enhance>
					<input type="hidden" name="id" value={session.id} />
					<button class="icon danger-icon" type="submit" aria-label="Delete {session.name}">✕</button>
				</form>
			</div>
		</div>

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

<form method="POST" action="?/add_session" use:enhance>
	<button class="btn add-day" type="submit">+ Add day</button>
</form>

{#if total > 0}
	<div class="volume card">
		<h2 class="label">Weekly sets per muscle</h2>
		<ul>
			{#each Object.entries(data.volume) as [group, sets] (group)}
				<li class="hairline-row volume-row">
					<span class="volume-name">{group}</span>
					<span class="num volume-sets" class:low={isUnderTarget(group, sets, profile?.weekly_sets_min)}>{sets}</span>
				</li>
			{/each}
		</ul>
		{#if profile}
			<p class="volume-note">
				{profile.weekly_sets_min}–{profile.weekly_sets_max} sets per muscle per week is the target.
				Anything outside that range is flagged.
			</p>
		{/if}
		{#if data.warnings.length > 0}
			<details class="volume-warnings">
				<summary>{data.warningSummary}</summary>
				<ul>
					{#each data.warnings as w (w.group)}
						<li>{w.message}</li>
					{/each}
				</ul>
			</details>
		{/if}
	</div>
{/if}

<div class="routine-actions">
	{#if !data.routine.is_active}
		<form method="POST" action="?/activate" use:enhance>
			<button class="btn primary wide" type="submit">Make this my routine</button>
		</form>
	{/if}
	<form method="POST" action="?/duplicate" use:enhance>
		<button class="btn quiet wide" type="submit">Duplicate</button>
	</form>
	<form method="POST" action="?/delete" use:enhance>
		<button class="btn danger wide" type="submit">Delete routine</button>
	</form>
</div>

<style lang="scss">
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: $space-3;

		form {
			flex: 1;
			min-width: 0;
		}
	}

	// Reads as the heading it replaces until you put a cursor in it.
	.title-input {
		width: 100%;
		font-size: 30px;
		padding: 0;
		border: none;
		border-bottom: 1px solid transparent;
		background: none;

		&:focus {
			border-bottom-color: $signal;
			outline: none;
		}
	}

	.active-tag {
		flex: none;
		font-family: $font-mono;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: $signal;
	}

	.profile-line {
		margin: $space-1 0 $space-4;

		a {
			color: $text-dim;
			text-decoration: underline;
		}
	}

	.error {
		margin-bottom: $space-3;
		font-size: 13px;
		color: $signal;
	}

	.session {
		margin-bottom: $space-5;
	}

	.session-head {
		display: flex;
		align-items: center;
		gap: $space-2;
		margin-bottom: $space-2;

		form:first-child {
			flex: 1;
			min-width: 0;
		}
	}

	.day-input {
		width: 100%;
		padding: 0;
		border: none;
		border-bottom: 1px solid transparent;
		background: none;

		&:focus {
			border-bottom-color: $signal;
			outline: none;
		}
	}

	.day-actions {
		display: flex;
		flex: none;
	}

	// Arrows rather than chevron glyphs: ⌃/⌄ carry different vertical metrics
	// in most faces and visibly sit on different baselines side by side.
	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: $tap-target;
		min-height: $tap-target-sm;
		font-size: 14px;
		line-height: 1;
		color: $text-dim;

		&:disabled {
			color: $hairline;
		}

		&:active:not(:disabled) {
			background: $hairline;
		}

		&.danger-icon {
			color: $danger;
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

	.add-day {
		width: 100%;
		margin-bottom: $space-5;
	}

	.volume {
		padding: $space-3 $space-4;
		margin-bottom: $space-5;

		h2 {
			margin-bottom: $space-2;
		}
	}

	.volume-row {
		min-height: 36px;
	}

	.volume-name {
		font-size: 13px;
		text-transform: capitalize;
	}

	.volume-sets {
		font-size: 12px;
		color: $text-dim;

		&.low {
			color: $signal;
		}
	}

	.volume-note {
		margin-top: $space-2;
		font-size: 12px;
		color: $text-faint;
		line-height: 1.45;
	}

	.volume-warnings {
		margin-top: $space-3;

		summary {
			font-size: 13px;
			color: $signal;
			cursor: pointer;
			line-height: 1.45;
		}

		ul {
			margin-top: $space-2;
			padding-left: $space-4;
			list-style: disc;
		}

		li {
			font-size: 13px;
			color: $signal;
			line-height: 1.45;

			+ li {
				margin-top: $space-2;
			}
		}
	}

	.routine-actions {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		margin-bottom: $space-6;
	}

	.wide {
		width: 100%;
	}
</style>
