<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	// The library. Destructive actions are deliberately absent: delete and
	// duplicate live in the editor, where you can see what you are acting on.
	// A list of near-identical rows is the worst place for a delete button.
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const profileName = (key: string) => data.profiles.find((p) => p.key === key)?.name ?? key;
</script>

<svelte:head><title>{APP_NAME} — routines</title></svelte:head>

<h1 class="display page-title">Routines</h1>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if data.routines.length > 0}
	<ul class="list">
		{#each data.routines as r (r.id)}
			<li class="card routine">
				<a class="routine-main" href="/routines/{r.id}">
					<span class="routine-head">
						<span class="routine-name display">{r.name}</span>
						{#if r.is_active}<span class="active-tag">Active</span>{/if}
					</span>
					<span class="routine-meta num">
						{r.session_count}
						{r.session_count === 1 ? 'day' : 'days'} · {r.exercise_count} exercises
					</span>
					<span class="routine-profile label">{profileName(r.profile_key)}</span>
				</a>
				{#if !r.is_active}
					<form method="POST" action="?/activate" use:enhance>
						<input type="hidden" name="id" value={r.id} />
						<button class="btn quiet use" type="submit" disabled={r.exercise_count === 0}>Use</button>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<div class="card empty">
		<p class="display empty-title">No routines yet</p>
		<p class="hint">
			Generate one from what your gym actually has, or build your own day by day.
		</p>
	</div>
{/if}

<div class="new">
	<a class="btn primary wide" href="/routines/generate">Generate a split</a>
	<form method="POST" action="?/create" use:enhance>
		<button class="btn wide" type="submit">Build from scratch</button>
	</form>
</div>

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-4;
	}

	.error {
		margin-bottom: $space-3;
		font-size: 13px;
		color: $signal;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: $space-3;
		margin-bottom: $space-5;
	}

	.routine {
		display: flex;
		align-items: stretch;
	}

	.routine-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
		padding: $space-3 $space-4;
	}

	.routine-head {
		display: flex;
		align-items: baseline;
		gap: $space-2;
	}

	.routine-name {
		font-size: 20px;
	}

	.active-tag {
		font-family: $font-mono;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: $signal;
	}

	.routine-meta {
		font-size: 12px;
		color: $text-dim;
	}

	.routine-profile {
		color: $text-faint;
	}

	.use {
		height: 100%;
		border-left: 1px solid $hairline;
		padding-inline: $space-4;
	}

	.empty {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		padding: $space-5 $space-4;
		margin-bottom: $space-5;

		.empty-title {
			font-size: 26px;
		}
	}

	.hint {
		font-size: 13px;
		color: $text-dim;
		line-height: 1.5;
	}

	.new {
		display: flex;
		flex-direction: column;
		gap: $space-2;
	}

	.wide {
		width: 100%;
	}
</style>
