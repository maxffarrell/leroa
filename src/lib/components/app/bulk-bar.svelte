<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import X from '@lucide/svelte/icons/x';

	let {
		count,
		total,
		onselectall,
		onclear,
		actions
	}: {
		count: number;
		total: number;
		onselectall: () => void;
		onclear: () => void;
		actions: Snippet;
	} = $props();
</script>

{#if count > 0}
	<div
		class="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-lg"
	>
		<span class="text-sm font-medium whitespace-nowrap">{count} selected</span>
		{#if count < total}
			<Button variant="ghost" size="sm" onclick={onselectall}>All {total}</Button>
		{/if}
		{@render actions()}
		<Button variant="ghost" size="icon-sm" aria-label="Clear selection" onclick={onclear}
			><X /></Button
		>
	</div>
{/if}
