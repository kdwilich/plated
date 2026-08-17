<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<svelte:head><title>Plateload — create an account</title></svelte:head>

<div class="auth">
	<header>
		<h1 class="display wordmark">PLATELOAD</h1>
		<p class="label">Create an account</p>
	</header>

	<form method="POST" use:enhance class="card fields">
		<label>
			<span class="label">Email</span>
			<input
				type="email"
				name="email"
				value={form?.email ?? ''}
				autocomplete="email"
				autocapitalize="none"
				spellcheck="false"
				required
			/>
		</label>

		<label>
			<span class="label">Password</span>
			<input
				type="password"
				name="password"
				autocomplete="new-password"
				minlength="10"
				required
			/>
			<span class="hint">At least 10 characters.</span>
		</label>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button class="btn primary" type="submit">Create account</button>
	</form>

	<p class="alt">
		Already have one? <a href="/login">Sign in</a>
	</p>
</div>

<style lang="scss">
	.auth {
		display: flex;
		flex-direction: column;
		gap: $space-5;
		max-width: 380px;
		margin: 0 auto;
		padding-top: $space-6;
	}

	header {
		display: flex;
		flex-direction: column;
		gap: $space-2;
	}

	.wordmark {
		font-size: 40px;
		letter-spacing: 0.02em;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: $space-4;
		padding: $space-4;
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

	.error {
		font-size: 13px;
		color: $signal;
	}

	.alt {
		font-size: 13px;
		color: $text-dim;
		text-align: center;

		a {
			color: $text;
			border-bottom: 1px solid $hairline;
		}
	}
</style>
