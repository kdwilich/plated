<script lang="ts">
	import { APP_NAME } from '$lib/brand';
	import ExerciseGuide from '$lib/components/ExerciseGuide.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{APP_NAME} — {data.exercise.name}</title></svelte:head>

<ExerciseGuide exercise={data.exercise} history={data.history} records={data.records} />
