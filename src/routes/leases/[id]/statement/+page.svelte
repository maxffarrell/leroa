<script lang="ts">
	import { statementTotals } from '#lib/statement-totals.ts';
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import Printer from '@lucide/svelte/icons/printer';
	import { getLease } from '#lib/remote/leasing.remote.ts';
	import { getOrgProfile } from '#lib/remote/workspace.remote.ts';
	import { formatDate, formatMoney, tenantName } from '#lib/format.ts';

	const id = page.params.id!;
	const l = await getLease(id);
	const org = await getOrgProfile();

	const charges = [...l.charges].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
	const payments = [...l.payments].sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
	const { charged, paid, ledgerBalance } = statementTotals(charges, payments);

	const billTo = l.tenants.map((t) => tenantName(t));
	const term = `${formatDate(l.startDate)} – ${l.endDate ? formatDate(l.endDate) : 'Month-to-month'}`;
</script>

<svelte:head><title>Rent statement — {l.propertyName} · {l.unitName}</title></svelte:head>

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
					<p class="mt-1 text-neutral-500">Rent statement</p>
				</div>
				<dl class="w-72 space-y-5">
					<div class="grid grid-cols-[8rem_1fr] gap-x-4">
						<dt class="text-sm text-neutral-400">Resident</dt>
						<dd class="text-sm">
							{#each billTo as line (line)}
								{line}<br />
							{/each}
						</dd>
					</div>
					<div class="grid grid-cols-[8rem_1fr] gap-x-4">
						<dt class="text-sm text-neutral-400">Property</dt>
						<dd class="text-sm">{l.propertyName} · {l.unitName}</dd>
						<dt class="text-sm text-neutral-400">Term</dt>
						<dd class="text-sm">{term}</dd>
						<dt class="text-sm text-neutral-400">Rent</dt>
						<dd class="text-sm">
							{formatMoney(l.rentAmount, l.currency)} / mo, due on the {l.rentDueDay}{l.rentDueDay ===
							1
								? 'st'
								: l.rentDueDay === 2
									? 'nd'
									: l.rentDueDay === 3
										? 'rd'
										: 'th'}
						</dd>
						<dt class="text-sm text-neutral-400">Status</dt>
						<dd class="text-sm capitalize">{l.status}</dd>
					</div>
				</dl>
			</header>

			<h1 class="mt-16 text-right text-7xl font-bold tracking-tight">Statement</h1>

			<table class="mt-12 w-full border-t border-neutral-200 text-sm">
				<thead>
					<tr>
						<th class="py-3 text-left font-medium">Charge</th>
						<th class="py-3 text-left font-medium">Due</th>
						<th class="w-40 py-3 text-right font-medium">
							Amount {l.currency.toUpperCase()}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each charges as c (c.id)}
						<tr>
							<td class="py-2">{c.description ?? c.kind}</td>
							<td class="py-2 text-neutral-500">{formatDate(c.dueDate)}</td>
							<td class="py-2 text-right tabular-nums">{formatMoney(c.amount, l.currency)}</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="py-6 text-neutral-500">No charges.</td></tr>
					{/each}
				</tbody>
			</table>

			<table class="mt-10 w-full border-t border-neutral-200 text-sm">
				<thead>
					<tr>
						<th class="py-3 text-left font-medium">Payment</th>
						<th class="py-3 text-left font-medium">Received</th>
						<th class="w-40 py-3 text-right font-medium">
							Amount {l.currency.toUpperCase()}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each payments as p (p.id)}
						<tr>
							<td class="py-2">
								<span class="uppercase">{p.method}</span>{#if p.reference}<span
										class="text-neutral-500"
									>
										· {p.reference}
									</span>{/if}
							</td>
							<td class="py-2 text-neutral-500">{formatDate(p.receivedOn)}</td>
							<td class="py-2 text-right tabular-nums">{formatMoney(p.amount, l.currency)}</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="py-6 text-neutral-500">No payments.</td></tr>
					{/each}
				</tbody>
			</table>

			<div class="mt-8 flex justify-end">
				<dl class="w-72 space-y-1.5 text-sm">
					<div class="grid grid-cols-2 gap-x-4">
						<dt class="text-neutral-500">Charges</dt>
						<dd class="text-right tabular-nums">{formatMoney(charged, l.currency)}</dd>
						<dt class="text-neutral-500">Paid</dt>
						<dd class="text-right tabular-nums">-{formatMoney(paid, l.currency)}</dd>
					</div>
					<div class="grid grid-cols-2 gap-x-4 border-t border-neutral-200 pt-2 text-lg">
						<dt>Ledger balance {l.currency.toUpperCase()}</dt>
						<dd class="text-right font-semibold tabular-nums">
							{formatMoney(ledgerBalance, l.currency)}
						</dd>
					</div>
					<div class="grid grid-cols-2 gap-x-4 pt-2">
						<dt class="text-neutral-500">Current balance</dt>
						<dd class="text-right tabular-nums">{formatMoney(l.balance, l.currency)}</dd>
					</div>
					<div>
						<dt class="sr-only">Balance calculation</dt>
						<dd class="text-xs text-neutral-500">
							Ledger balance includes future charges. Current balance includes charges due through
							today, less all recorded payments. Negative balances are credits.
						</dd>
					</div>
				</dl>
			</div>

			<footer class="mt-14 text-sm">
				{#if l.depositAmount > 0}
					<p class="text-xs text-neutral-500">
						Contractual deposit: {formatMoney(l.depositAmount, l.currency)}
					</p>
				{/if}
				{#if org.logoUrl}
					<img src={org.logoUrl} alt={org.name} class="mt-6 h-8 object-contain" />
				{/if}
			</footer>
		</div>
	</div>
</div>
