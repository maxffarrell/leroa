<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';

	let {
		columns,
		card
	}: {
		columns: { key: string; label: string; items: T[]; tone?: string }[];
		card: Snippet<[T]>;
	} = $props();
</script>

<div
	class="grid snap-x snap-mandatory auto-cols-[minmax(min(15rem,80vw),1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
>
	{#each columns as col (col.key)}
		<div class="flex min-h-40 snap-start flex-col rounded-lg border bg-muted/30">
			<div class="flex items-center justify-between px-3 py-2">
				<h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{col.label}
				</h3>
				<span class="text-xs text-muted-foreground tabular-nums">{col.items.length}</span>
			</div>
			<ScrollArea class="flex-1">
				<div class="space-y-2 p-2 pt-0">
					{#each col.items as item, i (i)}
						{@render card(item)}
					{:else}
						<p class="px-2 py-4 text-center text-xs text-muted-foreground">Nothing here</p>
					{/each}
				</div>
			</ScrollArea>
		</div>
	{/each}
</div>
