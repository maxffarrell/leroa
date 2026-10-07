<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import VendorDialog from '#lib/components/app/vendor-dialog.svelte';
	import InsuranceBadge from '#lib/components/app/insurance-badge.svelte';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
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
	import { getVendors } from '#lib/remote/vendors.remote.ts';
	import { formatMoney } from '#lib/format.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import HardHat from '@lucide/svelte/icons/hard-hat';

	type Row = Awaited<ReturnType<typeof getVendors>>[number];

	let showArchived = $state(false);
	const vendors = $derived(await getVendors(showArchived));
	let search = $state('');
	let creating = $state(page.url.searchParams.has('new'));
	let sorting = $state<SortingState>([]);

	const rows = $derived(
		vendors.filter(
			(v) =>
				!search ||
				`${v.name} ${v.contactName ?? ''} ${v.trades.join(' ')} ${v.email ?? ''} ${v.phone ?? ''}`
					.toLowerCase()
					.includes(search.toLowerCase())
		)
	);

	const colClass: Record<string, string> = {
		contact: 'hidden md:table-cell',
		openCount: 'text-right',
		spendYtd: 'hidden text-right lg:table-cell',
		insuranceExpiresOn: 'hidden sm:table-cell'
	};

	const columns: ColumnDef<Row>[] = [
		{
			accessorKey: 'name',
			header: 'Vendor',
			cell: (c) => renderSnippet(vendorCell, c.row.original)
		},
		{
			id: 'contact',
			accessorFn: (v) => v.contactName ?? v.email ?? '',
			header: 'Contact',
			cell: (c) => renderSnippet(contactCell, c.row.original)
		},
		{
			id: 'openCount',
			accessorFn: (v) => v.openCount,
			header: 'Open jobs',
			cell: (c) => renderSnippet(jobsCell, c.row.original)
		},
		{
			accessorKey: 'spendYtd',
			header: 'Spent this year',
			cell: (c) => formatMoney(c.getValue<number>())
		},
		{
			accessorKey: 'insuranceExpiresOn',
			header: 'Insurance',
			cell: (c) => renderSnippet(insuranceCell, c.row.original)
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
			const v = table.getRowModel().rows[i]?.original;
			if (v) openHref(`/vendors/${v.id}`);
		},
		create: () => (creating = true)
	});
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Vendors">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> <span class="hidden sm:inline">New vendor</span>
			<Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	{#if vendors.length === 0 && !showArchived}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><HardHat /></Empty.Media>
				<Empty.Title>No vendors yet</Empty.Title>
				<Empty.Description
					>Add the plumbers, electricians and cleaners you work with, then assign them to
					maintenance requests.</Empty.Description
				>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (creating = true)}><Plus /> New vendor</Button></Empty.Content
			>
		</Empty.Root>
	{:else}
		<div class="mb-3 flex flex-wrap items-center gap-3">
			<Input
				placeholder="Filter by name, trade, phone…"
				class="h-8 max-w-64"
				bind:value={search}
				oninput={() => (nav.index = -1)}
			/>
			<label class="flex items-center gap-2 text-sm text-muted-foreground"
				><input type="checkbox" bind:checked={showArchived} class="accent-primary" /> Show archived</label
			>
		</div>
		<div class="overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header>
					{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
						<Table.Row>
							{#each headerGroup.headers as header (header.id)}
								<Table.Head class={colClass[header.column.id]}>
									{#if header.column.getCanSort()}
										<SortHead
											column={header.column}
											label={String(header.column.columnDef.header)}
										/>
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
							class="cursor-pointer {row.original.archivedAt ? 'opacity-60' : ''}"
							onclick={() => openHref(`/vendors/${row.original.id}`)}
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
							><Table.Cell colspan={columns.length} class="py-8 text-center text-muted-foreground"
								>No vendors match.</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<VendorDialog bind:open={creating} onsaved={(v) => openHref(`/vendors/${v.id}`)} />

{#snippet vendorCell(v: Row)}
	<div class="max-w-56">
		<a href="/vendors/{v.id}" class="block truncate font-medium outline-none"
			>{v.name}{v.archivedAt ? ' (archived)' : ''}</a
		>
		<span class="block truncate text-xs text-muted-foreground"
			>{v.trades.join(', ') || 'No trades set'}</span
		>
		<InsuranceBadge expiresOn={v.insuranceExpiresOn} class="mt-1 sm:hidden" />
	</div>
{/snippet}

{#snippet contactCell(v: Row)}
	<div class="max-w-56 text-muted-foreground">
		<span class="block truncate">{v.contactName ?? v.email ?? '—'}</span>
		{#if v.phone}<span class="block truncate text-xs tabular-nums">{v.phone}</span>{/if}
	</div>
{/snippet}

{#snippet jobsCell(v: Row)}
	<div class="text-right tabular-nums">
		{v.openCount}<span class="text-muted-foreground"> / {v.jobCount}</span>
	</div>
{/snippet}

{#snippet insuranceCell(v: Row)}
	<InsuranceBadge expiresOn={v.insuranceExpiresOn} />
{/snippet}
