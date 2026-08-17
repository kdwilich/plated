<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const platesText = $derived(
		data.gym.plates.map((p) => `${p.denomination_lb}x${p.pairs}`).join(', ')
	);
	const barsText = $derived(
		data.gym.bars.map((b) => `${b.name}:${b.weight_lb}${b.is_default ? '*' : ''}`).join(', ')
	);

</script>

<svelte:head><title>Plateload — gym</title></svelte:head>

<h1 class="display page-title">Your gym</h1>
<p class="hint">The generator only prescribes what's here, and the plate math only uses plates you have.</p>

<form method="POST" action="?/save" use:enhance>
	<label class="field">
		<span class="label">Name</span>
		<input type="text" name="name" value={data.gym.name} />
	</label>

	<fieldset class="field">
		<span class="label">Equipment</span>
		<div class="equipment">
			{#each data.equipmentKeys as key (key)}
				<label class="eq" class:on={data.gym.equipment.includes(key)}>
					<input type="checkbox" name="eq:{key}" checked={data.gym.equipment.includes(key)} />
					<span>{key}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<label class="field">
		<span class="label">Plates (per side pairs) — "45x10, 25x2, 10x4, 5x2, 2.5x2"</span>
		<input type="text" name="plates" value={platesText} class="num" />
	</label>

	<label class="field">
		<span class="label">Bars — "Straight bar:45*, EZ curl:25" (* = default)</span>
		<input type="text" name="bars" value={barsText} class="num" />
	</label>

	<div class="steps">
		<label class="field">
			<span class="label">Dumbbell step (lb)</span>
			<input type="number" name="dumbbell_step" value={data.gym.dumbbell_step_lb} step="0.5" class="num" />
		</label>
		<label class="field">
			<span class="label">Machine step (lb)</span>
			<input type="number" name="machine_step" value={data.gym.machine_step_lb} step="0.5" class="num" />
		</label>
	</div>

	{#if form?.error}<p class="error">{form.error}</p>{/if}

	<button class="btn primary save" type="submit">Save gym</button>
</form>


<style lang="scss">
	.page-title {
		font-size: 30px;
		margin-bottom: $space-1;
	}

	.hint {
		font-size: 13px;
		color: $text-dim;
		margin-bottom: $space-5;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		margin-bottom: $space-4;
		border: none;
	}

	.equipment {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: $space-2;
	}

	.eq {
		display: flex;
		align-items: center;
		gap: $space-2;
		min-height: $tap-target;
		padding: 0 $space-3;
		border: 1px solid $hairline;
		border-radius: $radius;
		font-size: 14px;
		color: $text-dim;
		cursor: pointer;

		input {
			accent-color: #f2f4f7;
		}

		&.on {
			color: $text;
		}
	}

	.steps {
		display: flex;
		gap: $space-3;

		.field {
			flex: 1;
		}
	}

	.error {
		color: $signal;
		font-size: 13px;
		margin-bottom: $space-3;
	}

	.save {
		width: 100%;
	}

</style>
