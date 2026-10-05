<script lang="ts">
	import type { getOwnerReport } from '#lib/remote/owners.remote.ts';
	import StatusBadge from './status-badge.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import { formatDate, formatMoney, formatRelative, monthLabel } from '#lib/format.ts';

	type Report = Awaited<ReturnType<typeof getOwnerReport>>;
	let { report }: { report: Report } = $props();

	const money = (c: number) => formatMoney(c, report.currency);
	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
	const t = $derived(report.totals);
	const shortMonth = (m: string) =>
		new Date(`${m}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });

	const months = $derived.by(() => {
		const [y, m] = report.month.split('-').map(Number) as [number, number];
		return Array.from({ length: 6 }, (_, i) => {
			const key = new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7);
			const row = report.trend.find((r) => r.month === key);
			return { month: key, due: row?.due ?? 0, collected: row?.collected ?? 0 };
		});
	});
	const peak = $derived(Math.max(1, ...months.map((m) => m.due)));
</script>

{#if !report.properties.length}
	<Card.Root>
		<Card.Header>
			<Card.Title>No properties yet</Card.Title>
			<Card.Description
				>Properties appear here once they are assigned to this owner.</Card.Description
			>
		</Card.Header>
	</Card.Root>
{:else}
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<Card.Root size="sm">
			<Card.Header>
				<Card.Description>Occupancy</Card.Description>
				<Card.Title class="text-xl tabular-nums">{pct(t.occupied, t.units)}%</Card.Title>
				<p class="text-xs text-muted-foreground">
					{t.occupied} of {t.units} units{t.notice ? ` · ${t.notice} on notice` : ''}
				</p>
			</Card.Header>
		</Card.Root>
		<Card.Root size="sm">
			<Card.Header>
				<Card.Description>Rent collected · {shortMonth(report.month)}</Card.Description>
				<Card.Title class="text-xl tabular-nums">{money(t.rentCollected)}</Card.Title>
				<p class="text-xs text-muted-foreground">of {money(t.rentDue)} charged</p>
				<Progress
					class="mt-1"
					value={t.rentCollected}
					max={Math.max(1, t.rentDue)}
					aria-label="{pct(t.rentCollected, t.rentDue)}% collected"
				/>
			</Card.Header>
		</Card.Root>
		<Card.Root size="sm">
			<Card.Header>
				<Card.Description>Scheduled rent</Card.Description>
				<Card.Title class="text-xl tabular-nums">{money(t.scheduledRent)}</Card.Title>
				<p class="text-xs text-muted-foreground">per month from current leases</p>
			</Card.Header>
		</Card.Root>
		<Card.Root size="sm">
			<Card.Header>
				<Card.Description>Repairs this year</Card.Description>
				<Card.Title class="text-xl tabular-nums">{money(report.maintenance.spendYtd)}</Card.Title>
				<p class="text-xs text-muted-foreground">
					{report.maintenance.open.length} open {report.maintenance.open.length === 1
						? 'request'
						: 'requests'}
				</p>
			</Card.Header>
		</Card.Root>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Rent collection</Card.Title>
			<Card.Description>Rent charged and collected over the last six months</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex h-36 items-stretch gap-2 sm:gap-4">
				{#each months as m (m.month)}
					<div
						class="flex flex-1 flex-col items-center gap-1"
						role="img"
						aria-label="{monthLabel(m.month)}: {money(m.collected)} collected of {money(m.due)}"
						title="{monthLabel(m.month)}: {money(m.collected)} of {money(m.due)}"
					>
						<span class="text-[10px] text-muted-foreground tabular-nums"
							>{m.due ? `${pct(m.collected, m.due)}%` : ''}</span
						>
						<div class="relative w-full max-w-12 flex-1">
							<div
								class="absolute inset-x-0 bottom-0 rounded-t bg-muted"
								style:height="{(m.due / peak) * 100}%"
							></div>
							<div
								class="absolute inset-x-0 bottom-0 rounded-t bg-primary"
								style:height="{(m.collected / peak) * 100}%"
							></div>
						</div>
						<span class="text-xs text-muted-foreground">{shortMonth(m.month)}</span>
					</div>
				{/each}
			</div>
			<div class="mt-3 flex gap-4 text-xs text-muted-foreground">
				<span class="flex items-center gap-1.5"
					><span class="size-2.5 rounded-sm bg-primary"></span>Collected</span
				>
				<span class="flex items-center gap-1.5"
					><span class="size-2.5 rounded-sm bg-muted"></span>Charged</span
				>
			</div>
		</Card.Content>
	</Card.Root>

	{#each report.properties as p (p.id)}
		<Card.Root class="pb-0">
			<Card.Header>
				<Card.Title>{p.name}</Card.Title>
				<Card.Description>
					{p.address ? `${p.address} · ` : ''}{p.occupied}/{p.units.length} occupied · {money(
						p.scheduledRent
					)}/mo
				</Card.Description>
			</Card.Header>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="pl-4">Unit</Table.Head>
						<Table.Head class="hidden sm:table-cell">Resident</Table.Head>
						<Table.Head class="text-right">Rent</Table.Head>
						<Table.Head class="hidden md:table-cell">Lease ends</Table.Head>
						<Table.Head class="pr-4">{shortMonth(report.month)}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each p.units as u (u.id)}
						<Table.Row>
							<Table.Cell class="max-w-40 pl-4">
								<span class="font-medium">{u.name}</span>
								{#if u.tenants}<span class="block truncate text-xs text-muted-foreground sm:hidden"
										>{u.tenants}</span
									>{/if}
							</Table.Cell>
							<Table.Cell class="hidden max-w-56 truncate sm:table-cell"
								>{u.tenants ?? ''}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums"
								>{u.leaseRent != null ? money(u.leaseRent) : '—'}</Table.Cell
							>
							<Table.Cell class="hidden text-muted-foreground md:table-cell"
								>{u.tenants
									? u.leaseEnd
										? formatDate(u.leaseEnd)
										: 'Month-to-month'
									: ''}</Table.Cell
							>
							<Table.Cell class="pr-4"><StatusBadge status={u.rentStatus ?? u.status} /></Table.Cell
							>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>
	{/each}

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Leases ending soon</Card.Title>
				<Card.Description>Next 90 days</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="divide-y">
					{#each report.expiring as e (e.unitId)}
						<li class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
							<div class="min-w-0">
								<p class="truncate font-medium">{e.propertyName} · {e.unitName}</p>
								<p class="truncate text-xs text-muted-foreground">{e.tenants}</p>
							</div>
							<div class="shrink-0 text-right">
								<p class="tabular-nums">{formatDate(e.endDate, true)}</p>
								{#if e.renewing}<p class="text-xs text-emerald-700 dark:text-emerald-400">
										Renewed
									</p>{/if}
							</div>
						</li>
					{:else}
						<li class="text-muted-foreground">No leases end in the next 90 days.</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Maintenance</Card.Title>
				<Card.Description>Open requests and repairs completed this year</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<ul class="divide-y">
					{#each report.maintenance.open as m (m.id)}
						<li class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
							<div class="min-w-0">
								<p class="truncate font-medium">{m.title}</p>
								<p class="truncate text-xs text-muted-foreground">
									{m.propertyName}{m.unitName ? ` · ${m.unitName}` : ''} · {formatRelative(
										m.createdAt
									)}
								</p>
							</div>
							<div class="flex shrink-0 gap-1">
								{#if m.priority === 'urgent' || m.priority === 'high'}<StatusBadge
										status={m.priority}
									/>{/if}
								<StatusBadge status={m.status} />
							</div>
						</li>
					{:else}
						<li class="text-muted-foreground">No open requests.</li>
					{/each}
				</ul>
				{#if report.maintenance.recent.length}
					<div>
						<p class="mb-1 text-xs font-medium text-muted-foreground">Completed</p>
						<ul class="divide-y">
							{#each report.maintenance.recent as m (m.id)}
								<li class="flex items-center justify-between gap-3 py-2 last:pb-0">
									<div class="min-w-0">
										<p class="truncate">{m.title}</p>
										<p class="truncate text-xs text-muted-foreground">
											{m.propertyName}{m.unitName ? ` · ${m.unitName}` : ''}{m.closedAt
												? ` · ${formatDate(m.closedAt, true)}`
												: ''}
										</p>
									</div>
									<span class="shrink-0 tabular-nums"
										>{m.costAmount != null ? money(m.costAmount) : '—'}</span
									>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{/if}
