<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import TenantForm from '#lib/components/app/tenant-form.svelte';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import {
		createSvelteTable,
		FlexRender,
		renderSnippet
	} from '#lib/components/ui/data-table/index.js';
	import SortHead from '#lib/components/app/sort-head.svelte';
	import SavedViewsMenu from '#lib/components/app/saved-views-menu.svelte';
	import {
		getCoreRowModel,
		getSortedRowModel,
		type ColumnDef,
		type SortingState
	} from '@tanstack/table-core';
	import { getTenants } from '#lib/remote/portfolio.remote.ts';
	import { initials, tenantName } from '#lib/format.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';

	type Row = Awaited<ReturnType<typeof getTenants>>[number];

	const tenants = $derived(await getTenants());
	let filter = $state('');
	let creating = $state(page.url.searchParams.has('new'));
	let sorting = $state<SortingState>([]);
	const rows = $derived(
		filter
			? tenants.filter((t) =>
					`${tenantName(t)} ${t.email ?? ''} ${t.phone ?? ''} ${t.propertyName ?? ''}`
						.toLowerCase()
						.includes(filter.toLowerCase())
				)
			: tenants
	);

	const colClass: Record<string, string> = {
		email: 'hidden md:table-cell',
		phone: 'hidden lg:table-cell'
	};

	const columns: ColumnDef<Row>[] = [
		{
			id: 'name',
			accessorFn: (t) => tenantName(t),
			header: 'Name',
			cell: (c) => renderSnippet(nameCell, c.row.original)
		},
		{
			id: 'residence',
			accessorFn: (t) => (t.propertyName ? `${t.propertyName} ${t.unitName}` : ''),
			header: 'Residence',
			cell: (c) => renderSnippet(residenceCell, c.row.original)
		},
		{
			accessorKey: 'email',
			header: 'Email',
			cell: (c) => c.getValue() ?? ''
		},
		{
			accessorKey: 'phone',
			header: 'Phone',
			cell: (c) => c.getValue() ?? ''
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
			const t = table.getRowModel().rows[i]?.original;
			if (t) openHref(`/tenants/${t.id}`);
		},
		create: () => (creating = true)
	});
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Tenants">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> New <Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	{#if tenants.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Users /></Empty.Media>
				<Empty.Title>No tenants yet</Empty.Title>
				<Empty.Description>Add tenants here, or while creating a lease.</Empty.Description>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (creating = true)}><Plus /> Add tenant</Button></Empty.Content
			>
		</Empty.Root>
	{:else}
		<div class="mb-4 flex items-center gap-3">
			<Input
				placeholder="Filter by name, email, phone or property…"
				class="max-w-sm"
				bind:value={filter}
			/>
			<SavedViewsMenu
				page="tenants"
				current={() => ({ search: filter, sorting })}
				onapply={(s) => {
					filter = (s.search as string) ?? '';
					sorting = (s.sorting as SortingState) ?? [];
				}}
			/>
			<p class="ml-auto hidden text-xs text-muted-foreground md:block">
				{rows.length} of {tenants.length}
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
							class="cursor-pointer"
							onclick={() => openHref(`/tenants/${row.original.id}`)}
							onmouseenter={() => (nav.index = i)}
						>
							{#each row.getVisibleCells() as cell (cell.id)}
								<Table.Cell class={colClass[cell.column.id]}>
									<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<TenantForm bind:open={creating} oncreated={(t) => goto(`/tenants/${t.id}`)} />

{#snippet nameCell(t: Row)}
	<a href="/tenants/{t.id}" class="flex items-center gap-2.5 font-medium outline-none">
		<Avatar.Root class="size-7"
			><Avatar.Fallback class="text-xs">{initials(tenantName(t))}</Avatar.Fallback></Avatar.Root
		>
		{tenantName(t)}
	</a>
{/snippet}

{#snippet residenceCell(t: Row)}
	<span class="text-muted-foreground"
		>{t.propertyName ? `${t.propertyName} · ${t.unitName}` : 'No active lease'}</span
	>
{/snippet}
