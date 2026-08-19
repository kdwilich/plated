<script lang="ts">
	// Search plus the two axes people actually narrow a catalog by — what it
	// trains and what it needs — over a "Suggested" list that answers the
	// question before it is asked. With nothing typed and no filter on, the
	// suggestions are the whole screen; start typing and they step aside.

	import { onMount } from 'svelte';
	import { FORCES, primaryGroups, type Force } from '$lib/training/filters';
	import { DISPLAY_GROUPS } from '$lib/training/volume';
	import type { ExerciseRow } from '$lib/server/catalog';
	import GuideLink from '$lib/components/GuideLink.svelte';

	let {
		placeholder = 'Search exercises…',
		/** Exercise being replaced — switches suggestions to substitutes for it. */
		recommendFor = null,
		/** What the session already holds: the exclude list, and the day to match. */
		sessionIds = [],
		/** Off where picking already opens the guide, so the row isn't two doors
		 *  to the same room. */
		guideLinks = true,
		onpick,
		/** Fires when a query or filter is active, so a page can hide its own list. */
		onnarrow
	}: {
		placeholder?: string;
		recommendFor?: string | null;
		sessionIds?: string[];
		guideLinks?: boolean;
		onpick: (e: ExerciseRow) => void;
		onnarrow?: (narrowed: boolean) => void;
	} = $props();

	const EQUIPMENT: [string, string][] = [
		['barbell', 'Barbell'],
		['dumbbell', 'Dumbbell'],
		['machine', 'Machine'],
		['cable', 'Cable'],
		['body only', 'Bodyweight'],
		['kettlebells', 'Kettlebell'],
		['bands', 'Bands'],
		['e-z curl bar', 'EZ bar']
	];

	// The volume table's group names, shortened to fit a chip row on a phone.
	const GROUP_LABEL: Record<string, string> = {
		chest: 'Chest',
		back: 'Back',
		shoulders: 'Delts',
		quads: 'Quads',
		hamstrings: 'Hams',
		glutes: 'Glutes',
		biceps: 'Biceps',
		triceps: 'Triceps',
		calves: 'Calves',
		abs: 'Abs'
	};

	let q = $state('');
	let force = $state<Force | null>(null);
	let group = $state<string | null>(null);
	let equipment = $state<string | null>(null);

	let results = $state.raw<ExerciseRow[]>([]);
	let suggested = $state.raw<ExerciseRow[]>([]);
	let searching = $state(false);
	let seq = 0;

	const narrowed = $derived(!!(q.trim() || force || group || equipment));
	const shown = $derived(narrowed ? results : suggested);
	const heading = $derived(
		narrowed ? null : recommendFor ? 'Alternatives' : 'Suggested for this session'
	);

	$effect(() => {
		onnarrow?.(narrowed);
	});

	$effect(() => {
		const params = new URLSearchParams();
		if (q.trim()) params.set('q', q.trim());
		if (force) params.set('force', force);
		if (group) params.set('group', group);
		if (equipment) params.set('equipment', equipment);
		if ([...params].length === 0) {
			results = [];
			return;
		}
		searching = true;
		const mine = ++seq;
		const timer = setTimeout(async () => {
			const res = await fetch(`/api/search?${params}`);
			// A slow request must never overwrite a newer one's results.
			if (mine !== seq) return;
			if (res.ok) results = await res.json();
			searching = false;
		}, 150);
		return () => clearTimeout(timer);
	});

	onMount(async () => {
		const params = new URLSearchParams();
		if (recommendFor) params.set('for', recommendFor);
		if (sessionIds.length > 0) params.set('in', sessionIds.join(','));
		if ([...params].length === 0) return;
		const res = await fetch(`/api/recommend?${params}`);
		if (res.ok) suggested = await res.json();
	});

	function pick(ex: ExerciseRow) {
		onpick(ex);
		q = '';
		force = null;
		group = null;
		equipment = null;
		results = [];
	}

	const toggle = <T,>(current: T | null, value: T): T | null => (current === value ? null : value);

	const subtitle = (ex: ExerciseRow) =>
		[ex.equipment, primaryGroups(ex).map((g) => GROUP_LABEL[g] ?? g).join(' · ')]
			.filter(Boolean)
			.join('  ·  ');
</script>

<div class="picker">
	<input type="search" bind:value={q} {placeholder} autocomplete="off" />

	<div class="chips" role="group" aria-label="Filter by movement">
		{#each FORCES as f (f)}
			<button
				type="button"
				class="chip"
				class:on={force === f}
				aria-pressed={force === f}
				onclick={() => (force = toggle(force, f))}>{f}</button
			>
		{/each}
	</div>

	<div class="chips" role="group" aria-label="Filter by muscle">
		{#each DISPLAY_GROUPS as g (g)}
			<button
				type="button"
				class="chip"
				class:on={group === g}
				aria-pressed={group === g}
				onclick={() => (group = toggle(group, g))}>{GROUP_LABEL[g]}</button
			>
		{/each}
	</div>

	<select bind:value={equipment} aria-label="Filter by equipment">
		<option value={null}>Any equipment</option>
		{#each EQUIPMENT as [key, label] (key)}
			<option value={key}>{label}</option>
		{/each}
	</select>

	{#if heading && shown.length > 0}
		<span class="label heading">{heading}</span>
	{/if}

	{#if shown.length > 0}
		<ul>
			{#each shown as ex (ex.id)}
				<li>
					<button type="button" onclick={() => pick(ex)}>
						<span class="name">{ex.name}</span>
						<span class="meta num">{subtitle(ex)}</span>
					</button>
					{#if guideLinks}
						<GuideLink exerciseId={ex.id} name={ex.name} size={16} />
					{/if}
				</li>
			{/each}
		</ul>
	{:else if narrowed && !searching}
		<p class="empty">Nothing matches. Loosen a filter.</p>
	{/if}
</div>

<style lang="scss">
	.picker {
		display: flex;
		flex-direction: column;
		gap: $space-2;
	}

	.chips {
		display: flex;
		gap: $space-2;
		overflow-x: auto;
		scrollbar-width: none;
		// Bleed to the card edge so a half-visible chip signals "scroll me".
		margin-inline: -$space-4;
		padding-inline: $space-4;

		&::-webkit-scrollbar {
			display: none;
		}
	}

	.chip {
		flex: none;
		padding: 0 $space-3;
		min-height: 36px;
		border: 1px solid $hairline;
		border-radius: $radius;
		font-size: 13px;
		color: $text-dim;
		text-transform: capitalize;
		white-space: nowrap;

		&.on {
			border-color: $signal;
			color: $signal;
		}

		&:active {
			background: $hairline;
		}
	}

	.heading {
		margin-top: $space-2;
	}

	ul {
		max-height: 45dvh;
		overflow-y: auto;
		border: 1px solid $hairline;
		background: $surface-raised;
	}

	// The row is the pick target plus an optional guide link, so the hairline
	// belongs to the row rather than to the button inside it.
	li {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid $hairline-faint;
	}

	li button {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		flex: 1;
		min-width: 0;
		min-height: $tap-target;
		padding: $space-2 $space-3;
		text-align: left;

		&:active {
			background: $hairline;
		}
	}

	.name {
		font-size: 14px;
	}

	.meta {
		font-size: 11px;
		color: $text-faint;
		text-transform: capitalize;
	}

	.empty {
		font-size: 13px;
		color: $text-faint;
		padding: $space-2 0;
	}
</style>
