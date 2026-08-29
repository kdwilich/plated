<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { outboxCount } from '$lib/client/session';

	let { data, form } = $props();

	let pending = $state(0);
	onMount(async () => {
		pending = await outboxCount();
	});

	// Cancelled unconditionally first: the check is async, and by the time an
	// awaited answer came back the form would already have gone.
	function confirmSignOut(e: SubmitEvent) {
		e.preventDefault();
		const el = e.currentTarget as HTMLFormElement;
		void (async () => {
			const n = await outboxCount();
			const workouts = n === 1 ? 'workout' : 'workouts';
			if (n === 0 || confirm(`${n} finished ${workouts} still need to sync. Sign out anyway?`)) {
				el.submit(); // bypasses this handler, so it cannot loop
			}
		})();
	}

	const memberSince = $derived(
		data.profile
			? new Date(data.profile.created_at).toLocaleDateString(undefined, {
					month: 'long',
					year: 'numeric'
				})
			: ''
	);
</script>

<svelte:head><title>{APP_NAME} — account</title></svelte:head>

<h1 class="display page-title">Account</h1>

<section class="card block">
	<p class="email">{data.profile?.email}</p>
	<p class="since num">Member since {memberSince}</p>
</section>

<section class="card block">
	<span class="label">Sync</span>
	<p class="sync num">
		{#if pending === 0}
			Everything is synced.
		{:else}
			{pending} finished workout{pending === 1 ? '' : 's'} waiting to sync.
		{/if}
	</p>
</section>

<form method="POST" action="?/password" use:enhance class="card block fields">
	<span class="label">Change password</span>
	<!-- There is no reset flow and no way to send email. This is the only
	     recovery lever the app has, which is why it is on this page at all. -->
	<label>
		<span class="label">Current</span>
		<input type="password" name="current" autocomplete="current-password" required />
	</label>
	<label>
		<span class="label">New</span>
		<input type="password" name="next" autocomplete="new-password" minlength="10" required />
		<span class="hint">At least 10 characters.</span>
	</label>
	<label>
		<span class="label">Confirm new</span>
		<input type="password" name="confirm" autocomplete="new-password" minlength="10" required />
	</label>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{:else if form?.ok}
		<p class="ok">Password changed. Every other device has been signed out.</p>
	{/if}

	<button class="btn" type="submit">Change password</button>
</form>

<section class="card block">
	<span class="label">Export</span>
	<p class="hint export-hint">Every workout and set as JSON. There are no other backups.</p>
	<a class="btn" href="/you/account/export" download>Download my data</a>
</section>

<form method="POST" action="/logout" onsubmit={confirmSignOut} class="signout">
	<button class="btn quiet" type="submit">Sign out</button>
</form>

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-4;
	}

	.block {
		padding: $space-4;
		margin-bottom: $space-3;

		.label {
			display: block;
			margin-bottom: $space-2;
		}
	}

	.email {
		font-family: $font-display;
		font-weight: 600;
		font-size: 20px;
	}

	.since {
		margin-top: 2px;
		font-size: 12px;
		color: $text-faint;
	}

	.sync {
		font-size: 14px;
		color: $text-dim;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: $space-3;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: $space-1;
	}

	.hint {
		font-size: 12px;
		color: $text-faint;
	}

	.export-hint {
		margin-bottom: $space-3;
		line-height: 1.4;
	}

	.error {
		font-size: 13px;
		color: $signal;
	}

	.ok {
		font-size: 13px;
		color: $ok;
	}

	.signout {
		margin-top: $space-5;
		padding-top: $space-4;
		border-top: 1px solid $hairline;
	}
</style>
