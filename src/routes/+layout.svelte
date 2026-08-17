<script lang="ts">
	import '@fontsource/barlow-condensed/500.css';
	import '@fontsource/barlow-condensed/600.css';
	import '../styles/global.scss';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { installDrainTriggers, persistStorage } from '$lib/client/session';
	import GuideModal from '$lib/components/GuideModal.svelte';
	import ExerciseGuide from '$lib/components/ExerciseGuide.svelte';

	let { children, data } = $props();

	onMount(() => {
		void persistStorage();
		installDrainTriggers();
	});

	const tabs = [
		{ href: '/', label: 'Train' },
		{ href: '/routines', label: 'Routine' },
		{ href: '/exercises', label: 'Exercises' },
		{ href: '/history', label: 'History' }
	];

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/' || page.url.pathname.startsWith('/workout');
		return page.url.pathname.startsWith(href);
	}
</script>

<div class="shell" class:signed-out={!data.user}>
	<main>
		{@render children()}
	</main>
	<!-- A tab bar on the sign-in screen leads nowhere. -->
	{#if data.user}
		<nav>
			{#each tabs as tab (tab.href)}
				<a href={tab.href} class={{ active: isActive(tab.href) }}>{tab.label}</a>
			{/each}
		</nav>
	{/if}
</div>

<!-- Lives in the layout so every GuideLink gets it without its host wiring
     anything up. Closing is history.back(), so the entry pushState created is
     consumed rather than stranded. -->
{#if page.state.guide}
	<GuideModal onclose={() => history.back()}>
		<ExerciseGuide
			exercise={page.state.guide.exercise}
			history={page.state.guide.history}
		/>
	</GuideModal>
{/if}

<style lang="scss">
	.shell {
		max-width: 560px;
		margin: 0 auto;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		padding: $space-4 $space-4 calc($thumb-bar + $space-5);
	}

	// Without the tab bar there is nothing to clear at the bottom.
	.signed-out main {
		padding-bottom: $space-5;
	}

	nav {
		position: fixed;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		max-width: 560px;
		display: flex;
		background: $ground;
		border-top: 1px solid $hairline;
		padding-bottom: env(safe-area-inset-bottom);

		a {
			flex: 1;
			display: flex;
			align-items: center;
			justify-content: center;
			min-height: $tap-target + 8px;
			font-family: $font-display;
			font-weight: 600;
			font-size: 15px;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: $text-faint;

			&.active {
				color: $text;
				box-shadow: inset 0 2px 0 $text;
			}
		}
	}
</style>
