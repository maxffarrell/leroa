<script lang="ts">
	import type { Column } from '@tanstack/table-core';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { column, label }: { column: Column<any, any>; label: string } = $props();
	const sorted = $derived(column.getIsSorted());
</script>

<button
	type="button"
	class="-mx-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:bg-muted"
	onclick={() => column.toggleSorting()}
>
	{label}
	{#if sorted === 'asc'}<ArrowUp class="size-3.5" />
	{:else if sorted === 'desc'}<ArrowDown class="size-3.5" />
	{:else}<ArrowUpDown class="size-3.5 opacity-40" />{/if}
</button>
