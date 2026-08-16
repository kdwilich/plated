<script lang="ts">
	import ExerciseGuide from '$lib/components/ExerciseGuide.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Plateload — {data.exercise.name}</title></svelte:head>

<ExerciseGuide exercise={data.exercise} history={data.history} />
