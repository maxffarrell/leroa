<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { monthKey } from '#lib/format.ts';

	type Item = {
		id: string;
		/** yyyy-mm-dd */
		date: string;
		title: string;
		sub?: string;
		href?: string;
		tone?: 'default' | 'amber' | 'green' | 'red';
	};

	let { month = $bindable(monthKey()), items }: { month?: string; items: Item[] } = $props();

	const tones: Record<NonNullable<Item['tone']>, string> = {
		default: 'bg-primary/10 text-foreground',
		amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
		green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
		red: 'bg-red-500/15 text-red-700 dark:text-red-400'
	};

	const [y, m] = $derived(month.split('-').map(Number) as [number, number]);
	const firstDow = $derived(new Date(Date.UTC(y, m - 1, 1)).getUTCDay());
	const daysInMonth = $derived(new Date(Date.UTC(y, m, 0)).getUTCDate());
	const cells = $derived(
		Array.from({ length: firstDow + daysInMonth }, (_, i) =>
			i < firstDow ? null : i - firstDow + 1
		)
	);
	const today = $derived(new Date().toISOString().slice(0, 10));
	const byDay = $derived(
		Map.groupBy(
			items.filter((i) => i.date.startsWith(month)),
			(i) => Number(i.date.slice(8, 10))
		)
	);
	const label = $derived(
		new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		})
	);

	function shift(by: number) {
		month = monthKey(new Date(Date.UTC(y, m - 1 + by, 1)));
	}
</script>

<div>
	<div class="mb-2 flex items-center gap-2">
		<Button size="icon-sm" variant="outline" onclick={() => shift(-1)} aria-label="Previous month"
			><ChevronLeft /></Button
		>
		<p class="min-w-36 text-center text-sm font-medium">{label}</p>
		<Button size="icon-sm" variant="outline" onclick={() => shift(1)} aria-label="Next month"
			><ChevronRight /></Button
		>
	</div>
	<div class="overflow-hidden rounded-lg border">
		<div class="grid grid-cols-7 border-b bg-muted/40 text-center text-xs text-muted-foreground">
			{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as d (d)}
				<span class="py-1.5">{d}</span>
			{/each}
		</div>
		<div class="grid grid-cols-7">
			{#each cells as day, i (i)}
				<div
					class="min-h-16 border-r border-b p-1 align-top sm:min-h-20 [&:nth-child(7n)]:border-r-0"
					class:bg-muted={day === null}
				>
					{#if day}
						{@const iso = `${month}-${String(day).padStart(2, '0')}`}
						<p
							class="mb-0.5 text-right text-[11px] tabular-nums"
							class:font-semibold={iso === today}
							class:text-primary={iso === today}
							class:text-muted-foreground={iso !== today}
						>
							{day}
						</p>
						<div class="space-y-0.5">
							{#each byDay.get(day) ?? [] as item (item.id)}
								{#if item.href}
									<a
										href={item.href}
										title={item.sub ? `${item.title} · ${item.sub}` : item.title}
										class="block truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:underline {tones[
											item.tone ?? 'default'
										]}">{item.title}</a
									>
								{:else}
									<span
										class="block truncate rounded px-1 py-0.5 text-[11px] leading-tight {tones[
											item.tone ?? 'default'
										]}">{item.title}</span
									>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>
