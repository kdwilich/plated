<script lang="ts">
	import { enhance } from '$app/forms';
	import { defaultSplitStyle, type Emphasis, type SplitStyle } from '$lib/training/generate';
	import { isUnderTarget } from '$lib/training/volume';

	let { data, form } = $props();

	let days = $state(4);
	let profileKey = $state('hypertrophy');
	let splitStyle = $state<SplitStyle>('targeted');
	let touchedStyle = $state(false);
	let generating = $state(false);

	const selectedProfile = $derived(data.profiles.find((p) => p.key === profileKey));
	const recommended = $derived(defaultSplitStyle(days));

	// Follows the day count until you express a preference, then stays put.
	function pickDays(d: number) {
		days = d;
		if (!touchedStyle) splitStyle = defaultSplitStyle(d);
	}

	const STYLES: { key: SplitStyle; name: string; blurb: string }[] = [
		{
			key: 'full_body',
			name: 'Full body',
			blurb: 'Every session trains everything, patterns rotating. Each muscle gets hit as often as you train, and a missed day costs a fraction of the week.'
		},
		{
			key: 'targeted',
			name: 'Targeted',
			blurb: 'Each session owns a region — push/pull/legs or upper/lower. Shorter, more focused sessions; a missed day costs that region the whole week.'
		}
	];

	let emphasis = $state<Emphasis>('balanced');

	const EMPHASES: { key: Emphasis; name: string; blurb: string }[] = [
		{
			key: 'balanced',
			name: 'Balanced',
			blurb: 'Even volume across the whole body.'
		},
		{
			key: 'lower',
			name: 'Lower body focus',
			blurb: 'Extra glute, hamstring, quad, and calf work each session, with higher weekly targets. Upper body keeps its compounds at maintenance volume.'
		},
		{
			key: 'upper',
			name: 'Upper body focus',
			blurb: 'Extra chest, back, shoulder, and arm work each session, with higher weekly targets. Lower body keeps its compounds at maintenance volume.'
		}
	];
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
					<input type="radio" name="days" value={d} checked={days === d} onchange={() => pickDays(d)} />
					<span class="num">{d}</span>
				</label>
			{/each}
		</div>
	</div>

	<div class="field-block">
		<span class="label">Split style</span>
		{#each STYLES as s (s.key)}
			<label class="profile" class:selected={splitStyle === s.key}>
				<input
					type="radio"
					name="split_style"
					value={s.key}
					checked={splitStyle === s.key}
					onchange={() => {
						splitStyle = s.key;
						touchedStyle = true;
					}}
				/>
				<span class="profile-name">
					{s.name}
					{#if recommended === s.key}<span class="rec">recommended at {days} days</span>{/if}
				</span>
				<span class="style-blurb">{s.blurb}</span>
			</label>
		{/each}
	</div>

	<div class="field-block">
		<span class="label">Physique emphasis</span>
		{#each EMPHASES as e (e.key)}
			<label class="profile" class:selected={emphasis === e.key}>
				<input
					type="radio"
					name="emphasis"
					value={e.key}
					checked={emphasis === e.key}
					onchange={() => (emphasis = e.key)}
				/>
				<span class="profile-name">{e.name}</span>
				<span class="style-blurb">{e.blurb}</span>
			</label>
		{/each}
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
						<span class="num preview-rx" class:low={isUnderTarget(group, sets, form.profile?.weekly_sets_min)}>{sets}</span>
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

	.style-blurb {
		font-size: 12px;
		color: $text-dim;
		line-height: 1.45;
	}

	.rec {
		font-family: $font-mono;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: $signal;
		margin-left: $space-2;
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
