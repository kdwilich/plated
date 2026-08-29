<script lang="ts">
	import { APP_NAME, APP_WORDMARK } from '$lib/brand';
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head><title>{APP_NAME} — sign in</title></svelte:head>

<div class="auth">
	<header>
		<h1 class="display wordmark">{APP_WORDMARK}</h1>
		<p class="label">Sign in</p>
	</header>

	<form method="POST" use:enhance class="card fields">
		<input type="hidden" name="next" value={data.next} />

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
			<input type="password" name="password" autocomplete="current-password" required />
		</label>

		{#if form?.error}
			<p class="error">{form.error}</p>
		{/if}

		<button class="btn primary" type="submit">Sign in</button>
	</form>

	<p class="alt">
		No account? <a href="/signup">Create one</a>
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
