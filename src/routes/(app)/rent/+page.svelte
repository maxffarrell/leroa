<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import PaymentDialog, { type PaymentTarget } from '#lib/components/app/payment-dialog.svelte';
	import { RowNav } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { getRentRoll } from '#lib/remote/leasing.remote.ts';
	import { formatDate, formatMoney, monthKey } from '#lib/format.ts';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	type Filter = 'all' | 'unpaid' | 'overdue' | 'paid';
	let month = $state(monthKey());
	let filter = $state<Filter>((page.url.searchParams.get('filter') as Filter) ?? 'all');
	let search = $state('');
	let payment = $state<PaymentTarget | null>(null);

	const roll = $derived(await getRentRoll(month));
	const rows = $derived(
		roll.filter((r) => {
			if (filter === 'paid' && r.status !== 'paid') return false;
			if (filter === 'unpaid' && r.status === 'paid') return false;
			if (
				filter === 'overdue' &&
				r.status !== 'overdue' &&
				!(r.status === 'partial' && r.dueDate < new Date().toISOString().slice(0, 10))
			)
				return false;
			return (
				!search ||
				`${r.tenants} ${r.propertyName} ${r.unitName}`.toLowerCase().includes(search.toLowerCase())
			);
		})
	);
	const totals = $derived({
		due: roll.reduce((s, r) => s + r.amount, 0),
		paid: roll.reduce((s, r) => s + Math.min(r.paid, r.amount), 0),
		outstanding: roll.reduce((s, r) => s + Math.max(0, r.balance), 0)
	});
	const label = $derived(
		new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		})
	);

	function shift(by: number) {
		const [y, m] = month.split('-').map(Number) as [number, number];
		month = monthKey(new Date(Date.UTC(y, m - 1 + by, 1)));
	}

	function pay(i: number) {
		const r = rows[i];
		if (r && r.balance > 0)
			payment = {
				leaseId: r.leaseId,
				chargeId: r.id,
				balance: r.balance,
				label: `${r.tenants} · ${r.propertyName} ${r.unitName}`,
				month
			};
	}

	const nav = new RowNav({ count: () => rows.length, open: pay });
	function onkeydown(e: KeyboardEvent) {
		if (!(e.target instanceof HTMLInputElement) && !payment) {
			if (e.key === '[') return shift(-1);
			if (e.key === ']') return shift(1);
		}
		nav.onkeydown(e);
	}
</script>

<svelte:window {onkeydown} />

<PageHeader title="Rent" />

<main class="space-y-4 p-4 md:p-6">
	<div class="flex flex-wrap items-center gap-3">
		<div class="flex items-center gap-1">
			<Button size="icon-sm" variant="ghost" aria-label="Previous month" onclick={() => shift(-1)}
				><ChevronLeft /></Button
			>
			<h1 class="w-40 text-center text-lg font-semibold tabular-nums">{label}</h1>
			<Button size="icon-sm" variant="ghost" aria-label="Next month" onclick={() => shift(1)}
				><ChevronRight /></Button
			>
		</div>
		<div class="flex min-w-48 flex-1 items-center gap-3">
			<Progress value={totals.due ? (totals.paid / totals.due) * 100 : 0} class="max-w-48" />
			<p class="text-sm text-muted-foreground tabular-nums">
				<span class="font-medium text-foreground">{formatMoney(totals.paid)}</span> of {formatMoney(
					totals.due
				)} · {formatMoney(totals.outstanding)} outstanding
			</p>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			bind:value={() => filter, (v) => v && (filter = v as Filter)}
		>
			<ToggleGroup.Item value="all">All</ToggleGroup.Item>
			<ToggleGroup.Item value="unpaid">Unpaid</ToggleGroup.Item>
			<ToggleGroup.Item value="overdue">Overdue</ToggleGroup.Item>
			<ToggleGroup.Item value="paid">Paid</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Input placeholder="Filter…" class="h-8 max-w-56" bind:value={search} />
		<p class="ml-auto hidden text-xs text-muted-foreground lg:block">
			<Kbd>[</Kbd>
			<Kbd>]</Kbd> change month · <Kbd>J</Kbd>
			<Kbd>K</Kbd> move · <Kbd>↵</Kbd> record payment
		</p>
	</div>

	<div class="overflow-hidden rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Tenant</Table.Head>
					<Table.Head>Unit</Table.Head>
					<Table.Head class="hidden md:table-cell">Charge</Table.Head>
					<Table.Head class="hidden sm:table-cell">Due</Table.Head>
					<Table.Head class="text-right">Amount</Table.Head>
					<Table.Head class="hidden text-right sm:table-cell">Paid</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head class="w-24"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as r, i (r.id)}
					<Table.Row
						data-row={i}
						data-state={nav.index === i ? 'selected' : undefined}
						onmouseenter={() => (nav.index = i)}
					>
						<Table.Cell class="max-w-48 truncate font-medium"
							><a href="/leases/{r.leaseId}" class="hover:underline">{r.tenants || '—'}</a
							></Table.Cell
						>
						<Table.Cell class="text-muted-foreground">{r.propertyName} · {r.unitName}</Table.Cell>
						<Table.Cell class="hidden text-muted-foreground md:table-cell"
							>{r.description ?? r.kind}</Table.Cell
						>
						<Table.Cell class="hidden tabular-nums sm:table-cell"
							>{formatDate(r.dueDate, true)}</Table.Cell
						>
						<Table.Cell class="text-right tabular-nums"
							>{formatMoney(r.amount, r.currency)}</Table.Cell
						>
						<Table.Cell class="hidden text-right text-muted-foreground tabular-nums sm:table-cell"
							>{r.paid ? formatMoney(r.paid, r.currency) : '—'}</Table.Cell
						>
						<Table.Cell><StatusBadge status={r.status} /></Table.Cell>
						<Table.Cell class="text-right">
							{#if r.balance > 0}<Button
									size="sm"
									variant={r.status === 'overdue' ? 'default' : 'outline'}
									onclick={() => pay(i)}>Record</Button
								>{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row
						><Table.Cell colspan={8} class="py-10 text-center text-muted-foreground"
							>{roll.length
								? 'Nothing matches this filter.'
								: 'No charges this month. Active leases generate rent automatically.'}</Table.Cell
						></Table.Row
					>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</main>

<PaymentDialog bind:target={payment} />
