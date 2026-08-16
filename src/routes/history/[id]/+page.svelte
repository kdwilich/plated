<script lang="ts">
	let { data } = $props();

	interface SetRow {
		id: string;
		exercise_id: string;
		exercise_name: string;
		weight_lb: number | null;
		reps: number | null;
		duration_s: number | null;
		is_warmup: number;
	}

	const workout = $derived(data.workout as Record<string, unknown>);
	const sets = $derived(data.sets as unknown as SetRow[]);

	const grouped = $derived.by(() => {
		const out: { exercise_id: string; name: string; sets: SetRow[] }[] = [];
		for (const s of sets) {
			const last = out[out.length - 1];
			if (last && last.exercise_id === s.exercise_id) last.sets.push(s);
			else out.push({ exercise_id: s.exercise_id, name: s.exercise_name, sets: [s] });
		}
		return out;
	});

	const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
</script>

<svelte:head><title>Plateload — workout</title></svelte:head>

<h1 class="display page-title">{workout.session_name ?? 'Freestyle'}</h1>
<p class="meta num">
	{new Date(workout.started_at as string).toLocaleString(undefined, {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	})}
</p>

{#each grouped as g (g.exercise_id + g.sets[0].id)}
	<div class="card block">
		<a class="exercise-name" href="/exercises/{g.exercise_id}">{g.name}</a>
		<ul>
			{#each g.sets as s (s.id)}
				<li class="hairline-row set-row" class:warmup={s.is_warmup}>
					<span class="num set-label">{s.is_warmup ? 'W' : 'SET'}</span>
					<span class="num">
						{#if s.weight_lb != null}{fmt(s.weight_lb)}{/if}
						{#if s.reps != null}&nbsp;× {s.reps}{/if}
						{#if s.duration_s != null}&nbsp;{s.duration_s}s{/if}
					</span>
				</li>
			{/each}
		</ul>
	</div>
{/each}

<style lang="scss">
	.page-title {
		font-size: 28px;
		margin-bottom: $space-1;
	}

	.meta {
		font-size: 12px;
		color: $text-dim;
		margin-bottom: $space-4;
	}

	.block {
		padding: $space-3 $space-4;
		margin-bottom: $space-3;
	}

	.exercise-name {
		display: block;
		font-size: 14px;
		font-weight: 500;
		margin-bottom: $space-2;
	}

	.set-row {
		min-height: 34px;

		&.warmup {
			opacity: 0.5;
		}
	}

	.set-label {
		font-size: 11px;
		color: $text-faint;
	}
</style>
