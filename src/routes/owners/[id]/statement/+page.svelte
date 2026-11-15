<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import Printer from '@lucide/svelte/icons/printer';
	import { getOwner, getOwnerReport } from '#lib/remote/owners.remote.ts';
	import { getOrgProfile } from '#lib/remote/workspace.remote.ts';
	import { formatDate, formatMoney } from '#lib/format.ts';

	const id = page.params.id!;
	const o = await getOwner(id);
	const report = await getOwnerReport(id);
	const org = await getOrgProfile();

	const currency = report.currency;
	const [year, month] = report.month.split('-').map(Number) as [number, number];
	const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const occupancy = report.totals.units
		? Math.round((report.totals.occupied / report.totals.units) * 100)
		: 0;
</script>

<svelte:head><title>Owner statement — {o.name} — {monthLabel}</title></svelte:head>

<div class="min-h-screen bg-neutral-100 text-neutral-900 print:bg-white">
	<div class="mx-auto max-w-4xl px-6 py-10 print:p-0">
		<div class="mb-6 flex items-start justify-between print:hidden">
			<Button variant="outline" onclick={() => history.back()}>Back</Button>
			<Button onclick={() => window.print()}><Printer /> Print</Button>
		</div>

		<div class="bg-white px-14 py-14 print:px-0 print:py-0">
			<header class="flex items-start justify-between">
				<div>
					<p class="text-lg font-semibold">{org.name}</p>
					<p class="mt-1 text-neutral-500">Owner statement — {monthLabel}</p>
				</div>
				<dl class="w-72 space-y-5">
					<div class="grid grid-cols-[8rem_1fr] gap-x-4">
						<dt class="text-sm text-neutral-400">Owner</dt>
						<dd class="text-sm">{o.name}</dd>
					</div>
					<div class="grid grid-cols-[8rem_1fr] gap-x-4">
						<dt class="text-sm text-neutral-400">Period</dt>
						<dd class="text-sm">{monthLabel}</dd>
						<dt class="text-sm text-neutral-400">Units</dt>
						<dd class="text-sm">
							{report.totals.units} · {occupancy}% occupied
						</dd>
						<dt class="text-sm text-neutral-400">Scheduled rent</dt>
						<dd class="text-sm">{formatMoney(report.totals.scheduledRent, currency)} / mo</dd>
					</div>
				</dl>
			</header>

			<h1 class="mt-16 text-right text-6xl font-bold tracking-tight">Owner statement</h1>

			{#each report.properties as p (p.id)}
				<p class="mt-12 text-sm font-semibold">{p.name}</p>
				<table class="mt-2 w-full border-t border-neutral-200 text-sm">
					<thead>
						<tr>
							<th class="py-3 text-left font-medium">Unit</th>
							<th class="py-3 text-left font-medium">Resident</th>
							<th class="py-3 text-left font-medium">Status</th>
							<th class="w-40 py-3 text-right font-medium">Rent {currency.toUpperCase()}</th>
						</tr>
					</thead>
					<tbody>
						{#each p.units as u (u.id)}
							<tr>
								<td class="py-2">{u.name}</td>
								<td class="py-2 text-neutral-500">{u.tenants ?? '—'}</td>
								<td class="py-2 text-neutral-500 capitalize">
									{u.rentStatus ?? u.status}
								</td>
								<td class="py-2 text-right tabular-nums">
									{u.leaseRent != null ? formatMoney(u.leaseRent, currency) : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="mt-12 text-sm text-neutral-500">No properties assigned.</p>
			{/each}

			<div class="mt-8 flex justify-end">
				<dl class="w-72 space-y-1.5 text-sm">
					<div class="grid grid-cols-2 gap-x-4">
						<dt class="text-neutral-500">Rent due ({monthLabel})</dt>
						<dd class="text-right tabular-nums">{formatMoney(report.totals.rentDue, currency)}</dd>
						<dt class="text-neutral-500">Collected</dt>
						<dd class="text-right tabular-nums">
							{formatMoney(report.totals.rentCollected, currency)}
						</dd>
						{#if report.totals.overdue > 0}
							<dt class="text-neutral-500">Overdue charges</dt>
							<dd class="text-right tabular-nums">{report.totals.overdue}</dd>
						{/if}
					</div>
					<div class="grid grid-cols-2 gap-x-4 border-t border-neutral-200 pt-2 text-lg">
						<dt>Net collected {currency.toUpperCase()}</dt>
						<dd class="text-right font-semibold tabular-nums">
							{formatMoney(report.totals.rentCollected, currency)}
						</dd>
					</div>
				</dl>
			</div>

			{#if report.expiring.length}
				<p class="mt-12 text-sm font-semibold">Leases expiring within 90 days</p>
				<table class="mt-2 w-full border-t border-neutral-200 text-sm">
					<thead>
						<tr>
							<th class="py-3 text-left font-medium">Unit</th>
							<th class="py-3 text-left font-medium">Resident</th>
							<th class="py-3 text-left font-medium">Ends</th>
							<th class="w-40 py-3 text-right font-medium">Renewal</th>
						</tr>
					</thead>
					<tbody>
						{#each report.expiring as e (e.unitId)}
							<tr>
								<td class="py-2">{e.propertyName} · {e.unitName}</td>
								<td class="py-2 text-neutral-500">{e.tenants ?? '—'}</td>
								<td class="py-2 text-neutral-500">{formatDate(e.endDate)}</td>
								<td class="py-2 text-right text-neutral-500">
									{e.renewing ? 'In progress' : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			<footer class="mt-14 text-sm">
				<p class="font-semibold">Maintenance</p>
				<dl class="mt-3 grid grid-cols-[10rem_1fr] gap-y-1">
					<dt class="text-neutral-500">Open requests</dt>
					<dd>{report.maintenance.open.length}</dd>
					<dt class="text-neutral-500">Spend year to date</dt>
					<dd>{formatMoney(report.maintenance.spendYtd, currency)}</dd>
				</dl>
				<p class="mt-10 text-xs text-neutral-500">
					Prepared {formatDate(new Date())} by {org.name}.
				</p>
				{#if org.logoUrl}
					<img src={org.logoUrl} alt={org.name} class="mt-6 h-8 object-contain" />
				{/if}
			</footer>
		</div>
	</div>
</div>
