<script lang="ts">
	import { goto } from '$app/navigation';
	import ExerciseSearch from '$lib/components/ExerciseSearch.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Plateload — exercises</title></svelte:head>

<h1 class="display page-title">Exercises</h1>

<ExerciseSearch onpick={(ex) => goto(`/exercises/${ex.id}`)} />

<ul class="list">
	{#each data.top as ex (ex.id)}
		<li>
			<a class="hairline-row row" href="/exercises/{ex.id}">
				<span class="name">{ex.name}</span>
				<span class="meta num">{ex.equipment ?? ''}</span>
			</a>
		</li>
	{/each}
</ul>

<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-3;
	}

	.list {
		margin-top: $space-4;
	}

	.row {
		gap: $space-3;
	}

	.name {
		font-size: 14px;
	}

	.meta {
		font-size: 11px;
		color: $text-faint;
		white-space: nowrap;
	}
</style>
