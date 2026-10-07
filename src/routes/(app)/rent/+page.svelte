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
	import SavedViewsMenu from '#lib/components/app/saved-views-menu.svelte';
	import {
		createSvelteTable,
		FlexRender,
		renderSnippet
	} from '#lib/components/ui/data-table/index.js';
	import SortHead from '#lib/components/app/sort-head.svelte';
	import {
		getCoreRowModel,
		getSortedRowModel,
		type ColumnDef,
		type SortingState
	} from '@tanstack/table-core';
	import { getRentRoll } from '#lib/remote/leasing.remote.ts';
	import { formatDate, formatMoney, monthKey } from '#lib/format.ts';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	type Filter = 'all' | 'unpaid' | 'overdue' | 'paid';
	type Row = Awaited<ReturnType<typeof getRentRoll>>[number];

	let month = $state(monthKey());
	let filter = $state<Filter>((page.url.searchParams.get('filter') as Filter) ?? 'all');
	let search = $state('');
	let payment = $state<PaymentTarget | null>(null);
	let sorting = $state<SortingState>([]);

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

	function pay(r: Row) {
		if (r.balance > 0)
			payment = {
				leaseId: r.leaseId,
				chargeId: r.id,
				balance: r.balance,
				label: `${r.tenants} · ${r.propertyName} ${r.unitName}`,
				month
			};
	}

	const colClass: Record<string, string> = {
		charge: 'hidden md:table-cell',
		dueDate: 'hidden sm:table-cell',
		amount: 'text-right',
		paid: 'hidden text-right sm:table-cell',
		actions: 'w-24'
	};

	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'tenants',
			header: 'Tenant',
			cell: (c) => renderSnippet(tenantCell, c.row.original)
		},
		{
			id: 'unit',
			accessorFn: (r) => `${r.propertyName} ${r.unitName}`,
			header: 'Unit',
			cell: (c) => c.getValue()
		},
		{
			id: 'charge',
			accessorFn: (r) => r.description ?? r.kind,
			header: 'Charge',
			cell: (c) => c.getValue()
		},
		{
			accessorKey: 'dueDate',
			header: 'Due',
			cell: (c) => formatDate(c.getValue<string>(), true)
		},
		{
			accessorKey: 'amount',
			header: 'Amount',
			cell: (c) => formatMoney(c.getValue<number>(), c.row.original.currency)
		},
		{
			accessorKey: 'paid',
			header: 'Paid',
			cell: (c) => {
				const v = c.getValue<number>();
				return v ? formatMoney(v, c.row.original.currency) : '—';
			}
		},
		{
			accessorKey: 'status',
			header: 'Status',
			cell: (c) => renderSnippet(statusCell, c.row.original)
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			cell: (c) => renderSnippet(actionCell, c.row.original)
		}
	];

	const table = createSvelteTable<Row>({
		get data() {
			return rows;
		},
		columns,
		state: {
			get sorting() {
				return sorting;
			}
		},
		onSortingChange: (u) => (sorting = typeof u === 'function' ? u(sorting) : u),
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel()
	});

	const nav = new RowNav({
		count: () => table.getRowModel().rows.length,
		open: (i) => {
			const r = table.getRowModel().rows[i]?.original;
			if (r) pay(r);
		}
	});
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
		<SavedViewsMenu
			page="rent"
			current={() => ({ filter, search, sorting })}
			onapply={(s) => {
				filter = (s.filter as Filter) ?? 'all';
				search = (s.search as string) ?? '';
				sorting = (s.sorting as SortingState) ?? [];
			}}
		/>
		<p class="ml-auto hidden text-xs text-muted-foreground lg:block">
			<Kbd>[</Kbd>
			<Kbd>]</Kbd> change month · <Kbd>J</Kbd>
			<Kbd>K</Kbd> move · <Kbd>↵</Kbd> record payment
		</p>
	</div>

	<div class="overflow-x-auto rounded-lg border">
		<Table.Root>
			<Table.Header>
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row>
						{#each headerGroup.headers as header (header.id)}
							<Table.Head class={colClass[header.column.id]}>
								{#if header.column.getCanSort()}
									<SortHead column={header.column} label={String(header.column.columnDef.header)} />
								{:else}
									{header.column.columnDef.header}
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#each table.getRowModel().rows as row, i (row.original.id)}
					<Table.Row
						data-row={i}
						data-state={nav.index === i ? 'selected' : undefined}
						onmouseenter={() => (nav.index = i)}
					>
						{#each row.getVisibleCells() as cell (cell.id)}
							<Table.Cell class={colClass[cell.column.id]}>
								<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
							</Table.Cell>
						{/each}
					</Table.Row>
				{:else}
					<Table.Row
						><Table.Cell colspan={columns.length} class="py-10 text-center text-muted-foreground"
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

{#snippet tenantCell(r: Row)}
	<a href="/leases/{r.leaseId}" class="block max-w-48 truncate font-medium hover:underline"
		>{r.tenants || '—'}</a
	>
{/snippet}

{#snippet statusCell(r: Row)}
	<StatusBadge status={r.status} />
{/snippet}

{#snippet actionCell(r: Row)}
	{#if r.balance > 0}
		<div class="text-right">
			<Button
				size="sm"
				variant={r.status === 'overdue' ? 'default' : 'outline'}
				onclick={() => pay(r)}>Record</Button
			>
		</div>
	{/if}
{/snippet}
