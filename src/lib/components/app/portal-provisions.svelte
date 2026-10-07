<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { formatDate } from '#lib/format.ts';
	import { CLAUSE_KIND_LABELS } from '#lib/schemas.ts';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';

	type Provisions = {
		clauses: {
			id: string;
			kind: keyof typeof CLAUSE_KIND_LABELS;
			title: string;
			body: string | null;
		}[];
		dates: { id: string; label: string; date: string }[];
	};

	const { provisions }: { provisions: Provisions } = $props();
</script>

<div class="space-y-3">
	<h2 class="text-sm font-medium">Lease provisions</h2>
	{#if provisions.clauses.length}
		<ul class="space-y-2">
			{#each provisions.clauses as c (c.id)}
				<li class="rounded-lg border px-3 py-2 text-sm">
					<Badge variant="secondary" class="mr-1.5">{CLAUSE_KIND_LABELS[c.kind]}</Badge>
					<span class="font-medium">{c.title}</span>
					{#if c.body}<p class="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">
							{c.body}
						</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if provisions.dates.length}
		<ul class="space-y-1 text-sm">
			{#each provisions.dates as d (d.id)}
				<li class="flex items-center gap-2">
					<CalendarClock class="size-3.5 shrink-0 text-muted-foreground" />
					<span class="text-muted-foreground tabular-nums">{formatDate(d.date)}</span>
					<span>{d.label}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
