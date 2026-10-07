<script lang="ts">
	import { buildStacking, type StackingUnit, type Tone } from '#lib/stacking.ts';
	import { formatDate, formatMoney, todayISO } from '#lib/format.ts';
	import { Badge } from '#lib/components/ui/badge/index.js';

	type Unit = StackingUnit & {
		id: string;
		marketRent?: number | null;
		leaseRent?: number | null;
		leaseId?: string | null;
		areaSqft?: number | null;
	};

	const { units }: { units: Unit[] } = $props();

	const { columns, rows } = $derived(buildStacking(units, todayISO()));

	const TONES: Record<Tone, string> = {
		occupied: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100',
		expiring: 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100',
		notice: 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-100',
		vacant: 'border-dashed text-muted-foreground',
		offline: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
		other: 'text-foreground'
	};

	const LEGEND: [Tone, string][] = [
		['occupied', 'Occupied'],
		['expiring', 'Expiring <90d'],
		['notice', 'Notice'],
		['vacant', 'Vacant'],
		['offline', 'Offline']
	];
</script>

<div class="space-y-2">
	<div class="flex flex-wrap gap-3">
		{#each LEGEND as [tone, label] (tone)}
			<span class="flex items-center gap-1.5 text-xs text-muted-foreground"
				><span class="inline-block size-2.5 rounded-sm border {TONES[tone]}"></span>{label}</span
			>
		{/each}
	</div>
	<div class="overflow-x-auto rounded-lg border">
		<table class="w-full border-collapse text-sm">
			<tbody>
				{#each rows as row (row.floor)}
					<tr class="border-b last:border-0">
						<th
							class="w-16 border-r bg-muted/30 px-2 py-1 text-right align-top text-xs font-medium text-muted-foreground"
						>
							{#if row.floor === '—'}·{:else}Floor {row.floor}{/if}
						</th>
						{#each row.cells as cell, i (columns[i])}
							<td class="min-w-28 border-r p-1 align-top last:border-0">
								{#if cell}
									{@const u = cell.unit as Unit}
									<div
										class="h-full rounded-md border px-2 py-1.5 {TONES[cell.tone]}"
										title="{u.name} · {u.status}"
									>
										<div class="flex items-center justify-between gap-1">
											<span class="text-xs font-semibold">{u.name}</span>
											{#if cell.tone === 'expiring'}
												<Badge variant="outline" class="px-1 text-[10px]"
													>{formatDate(u.leaseEnd!, true)}</Badge
												>
											{/if}
										</div>
										<div class="mt-0.5 text-[11px] leading-tight">
											{#if u.status === 'occupied' && u.leaseRent != null}
												{formatMoney(u.leaseRent)}/mo
											{:else if u.marketRent != null}
												{formatMoney(u.marketRent)} mkt
											{:else}
												<span class="capitalize">{u.status}</span>
											{/if}
											{#if u.areaSqft}<span class="text-muted-foreground">
													· {u.areaSqft.toLocaleString()} sf</span
												>{/if}
										</div>
									</div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="text-xs text-muted-foreground">
		Floors and stacks are inferred from unit names (e.g. 204 → floor 2, stack 04).
	</p>
</div>
