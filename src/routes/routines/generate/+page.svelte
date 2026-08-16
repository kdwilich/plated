<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let days = $state(4);
	let profileKey = $state('hypertrophy');
	let generating = $state(false);

	const selectedProfile = $derived(data.profiles.find((p) => p.key === profileKey));
</script>

<svelte:head><title>Plateload — generate</title></svelte:head>

<h1 class="display page-title">Generate a split</h1>
<p class="hint">
	Built from what <a href="/gym">your gym</a> actually has
	({data.gym.equipment.length} equipment types). Everything is editable after.
</p>

<form
	method="POST"
	action="?/generate"
	use:enhance={() => {
		generating = true;
		return async ({ update }) => {
			generating = false;
			await update({ reset: false });
		};
	}}
>
	<div class="field-block">
		<span class="label">Days per week</span>
		<div class="day-picker">
			{#each [2, 3, 4, 5, 6] as d (d)}
				<label class="day" class:selected={days === d}>
					<input type="radio" name="days" value={d} bind:group={days} />
					<span class="num">{d}</span>
				</label>
			{/each}
		</div>
	</div>

	<div class="field-block">
		<span class="label">Approach</span>
		{#each data.profiles as p (p.key)}
			<label class="profile" class:selected={profileKey === p.key}>
				<input type="radio" name="profile" value={p.key} bind:group={profileKey} />
				<span class="profile-name">{p.name}</span>
				<span class="profile-rx num">{p.weekly_sets_min}–{p.weekly_sets_max} sets/muscle/wk · RIR {p.rir}</span>
			</label>
		{/each}
		{#if selectedProfile}
			<p class="rationale">
				{selectedProfile.rationale}
				<a href={selectedProfile.source} target="_blank" rel="noopener">source</a>
			</p>
		{/if}
	</div>

	<button class="btn primary submit" type="submit" disabled={generating}>
		{generating ? 'Generating…' : 'Generate'}
	</button>
</form>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if form?.draft}
	<section class="preview">
		<h2 class="display preview-title">Draft</h2>
		{#each form.draft.warnings as w (w)}
			<p class="warning">{w}</p>
		{/each}

		{#each form.draft.sessions as s (s.name)}
			<div class="card preview-session">
				<h3 class="label">{s.name}</h3>
				<ul>
					{#each s.exercises as e (e.exercise.id)}
						<li class="hairline-row preview-row">
							<span class="preview-name">{e.exercise.name}</span>
							<span class="num preview-rx">{e.target_sets}×{e.rep_min}–{e.rep_max}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/each}

		<div class="volume card">
			<h3 class="label">Weekly sets per muscle</h3>
			<ul>
				{#each Object.entries(form.volume) as [group, sets] (group)}
					<li class="hairline-row preview-row">
						<span class="preview-name">{group}</span>
						<span class="num preview-rx" class:low={form.profile && sets < form.profile.weekly_sets_min}>{sets}</span>
					</li>
				{/each}
			</ul>
		</div>

		<form method="POST" action="?/save" use:enhance>
			<input type="hidden" name="draft" value={JSON.stringify(form.draft)} />
			<input type="text" name="name" placeholder="Routine name" value="{form.days}-day split" />
			<button class="btn primary submit" type="submit">Save as active routine</button>
		</form>
	</section>
{/if}

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-1;
	}

	.hint {
		font-size: 13px;
		color: $text-dim;
		margin-bottom: $space-5;

		a {
			text-decoration: underline;
		}
	}

	.field-block {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		margin-bottom: $space-5;
	}

	.day-picker {
		display: flex;
		gap: $space-2;
	}

	.day {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: $tap-target;
		border: 1px solid $hairline;
		border-radius: $radius;
		font-size: 18px;
		color: $text-dim;
		cursor: pointer;

		input {
			position: absolute;
			opacity: 0;
		}

		&.selected {
			border-color: $text;
			color: $text;
			background: $surface-raised;
		}
	}

	.profile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: $space-3;
		border: 1px solid $hairline;
		border-radius: $radius;
		cursor: pointer;

		input {
			position: absolute;
			opacity: 0;
		}

		&.selected {
			border-color: $text;
			background: $surface-raised;
		}
	}

	.profile-name {
		font-size: 14px;
		font-weight: 500;
	}

	.profile-rx {
		font-size: 11px;
		color: $text-faint;
	}

	.rationale {
		font-size: 13px;
		color: $text-dim;

		a {
			text-decoration: underline;
			color: $text-faint;
		}
	}

	.submit {
		width: 100%;
	}

	.error,
	.warning {
		margin: $space-3 0;
		font-size: 13px;
		color: $signal;
	}

	.preview {
		margin-top: $space-6;

		.preview-title {
			font-size: 24px;
			margin-bottom: $space-3;
		}
	}

	.preview-session,
	.volume {
		padding: $space-3 $space-4;
		margin-bottom: $space-3;
	}

	.preview-row {
		min-height: 36px;
	}

	.preview-name {
		font-size: 13px;
	}

	.preview-rx {
		font-size: 12px;
		color: $text-dim;

		&.low {
			color: $signal;
		}
	}

	input[type='text'] {
		margin-bottom: $space-2;
	}
</style>
