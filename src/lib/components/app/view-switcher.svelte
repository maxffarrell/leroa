<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import Table2 from '@lucide/svelte/icons/table';
	import KanbanSquare from '@lucide/svelte/icons/kanban';
	import Calendar from '@lucide/svelte/icons/calendar';

	export type ViewKind = 'table' | 'kanban' | 'calendar';
	const icons = { table: Table2, kanban: KanbanSquare, calendar: Calendar } as const;
	const labels = { table: 'Table', kanban: 'Board', calendar: 'Calendar' } as const;

	let { views, value = $bindable() }: { views: ViewKind[]; value: ViewKind } = $props();
</script>

<ToggleGroup.Root
	type="single"
	variant="outline"
	size="sm"
	bind:value={() => value, (v) => v && (value = v as ViewKind)}
	aria-label="View"
>
	{#each views as v (v)}
		{@const Icon = icons[v]}
		<ToggleGroup.Item value={v} aria-label={labels[v]} title={labels[v]}><Icon /></ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
