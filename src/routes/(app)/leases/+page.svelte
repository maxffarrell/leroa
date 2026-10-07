<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import LeaseForm from '#lib/components/app/lease-form.svelte';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import ViewSwitcher, { type ViewKind } from '#lib/components/app/view-switcher.svelte';
	import KanbanBoard from '#lib/components/app/kanban-board.svelte';
	import CalendarGrid from '#lib/components/app/calendar-grid.svelte';
	import { getLeases } from '#lib/remote/leasing.remote.ts';
	import { getUpcomingDates } from '#lib/remote/commercial.remote.ts';
	import { formatDate, formatMoney, monthKey } from '#lib/format.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import FileSignature from '@lucide/svelte/icons/file-signature';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';

	const leases = $derived(await getLeases());
	const upcoming = $derived(await getUpcomingDates());
	let tab = $state<'active' | 'draft' | 'past' | 'all'>('active');
	let view = $state<ViewKind>('table');
	let month = $state(monthKey());
	let creating = $state(page.url.searchParams.has('new'));
	const params = page.url.searchParams;

	const soon = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
	const rows = $derived(
		leases.filter((l) =>
			tab === 'all'
				? true
				: tab === 'past'
					? l.status === 'ended' || l.status === 'terminated'
					: l.status === tab
		)
	);
	const counts = $derived({
		active: leases.filter((l) => l.status === 'active').length,
		draft: leases.filter((l) => l.status === 'draft').length,
		past: leases.filter((l) => l.status === 'ended' || l.status === 'terminated').length,
		all: leases.length
	});
	type Lease = (typeof leases)[number];
	const kanbanColumns = $derived(
		(['draft', 'active', 'ended', 'terminated'] as const).map((status) => ({
			key: status,
			label: status,
			items: leases.filter((l) => l.status === status)
		}))
	);
	const calItems = $derived(
		leases.flatMap((l) => [
			{
				id: `${l.id}-start`,
				date: l.startDate,
				title: `${l.tenants || l.unitName} starts`,
				sub: `${l.propertyName} · ${l.unitName}`,
				href: `/leases/${l.id}`,
				tone: 'green' as const
			},
			...(l.endDate
				? [
						{
							id: `${l.id}-end`,
							date: l.endDate,
							title: `${l.tenants || l.unitName} ends`,
							sub: `${l.propertyName} · ${l.unitName}`,
							href: `/leases/${l.id}`,
							tone: (l.endDate <= soon ? 'red' : 'amber') as 'red' | 'amber'
						}
					]
				: [])
		])
	);
	const nav = new RowNav({
		count: () => rows.length,
		open: (i) => openHref(`/leases/${rows[i]!.id}`),
		create: () => (creating = true)
	});
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Leases">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> New <Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	{#if leases.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><FileSignature /></Empty.Media>
				<Empty.Title>No leases yet</Empty.Title>
				<Empty.Description>Create a lease to start tracking rent.</Empty.Description>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (creating = true)}><Plus /> New lease</Button></Empty.Content
			>
		</Empty.Root>
	{:else}
		{#if upcoming.length}
			<div
				class="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
			>
				<CalendarClock class="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<span class="text-xs font-medium">Critical dates</span>
				{#each upcoming as d (d.id)}
					<a
						href="/leases/{d.leaseId}"
						class="rounded-full border bg-background px-2.5 py-0.5 text-xs hover:bg-muted"
						><span class="tabular-nums">{formatDate(d.date, true)}</span> · {d.label}
						<span class="text-muted-foreground">{d.unitName}</span></a
					>
				{/each}
			</div>
		{/if}
		<div class="mb-4 flex items-center justify-between gap-3">
			{#if view === 'table'}
				<Tabs.Root bind:value={tab}>
					<Tabs.List>
						{#each ['active', 'draft', 'past', 'all'] as const as t (t)}
							<Tabs.Trigger value={t} class="capitalize"
								>{t}
								<span class="ml-1 text-xs text-muted-foreground tabular-nums">{counts[t]}</span
								></Tabs.Trigger
							>
						{/each}
					</Tabs.List>
				</Tabs.Root>
			{:else}
				<p class="text-sm text-muted-foreground">
					{view === 'kanban' ? 'Leases grouped by status' : 'Move-ins and move-outs'}
				</p>
			{/if}
			<ViewSwitcher views={['table', 'kanban', 'calendar']} bind:value={view} />
		</div>
		{#if view === 'kanban'}
			<KanbanBoard columns={kanbanColumns}>
				{#snippet card(l: Lease)}
					<a
						href="/leases/{l.id}"
						class="block rounded-md border bg-card p-2.5 text-sm shadow-xs hover:bg-accent"
					>
						<span class="block truncate font-medium">{l.tenants || '—'}</span>
						<span class="block truncate text-xs text-muted-foreground"
							>{l.propertyName} · {l.unitName}</span
						>
						<span class="mt-1 flex items-center justify-between text-xs"
							><span class="tabular-nums">{formatMoney(l.rentAmount, l.currency)}/mo</span
							>{#if l.balance > 0}<span class="text-red-600 dark:text-red-400"
									>owes {formatMoney(l.balance, l.currency)}</span
								>{/if}</span
						>
					</a>
				{/snippet}
			</KanbanBoard>
		{:else if view === 'calendar'}
			<CalendarGrid bind:month items={calItems} />
		{:else}
			<div class="overflow-hidden rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Tenants</Table.Head>
							<Table.Head>Unit</Table.Head>
							<Table.Head class="hidden md:table-cell">Term</Table.Head>
							<Table.Head class="text-right">Rent</Table.Head>
							<Table.Head class="text-right">Balance</Table.Head>
							<Table.Head class="hidden sm:table-cell">Status</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each rows as l, i (l.id)}
							<Table.Row
								data-row={i}
								data-state={nav.index === i ? 'selected' : undefined}
								class="cursor-pointer"
								onclick={() => openHref(`/leases/${l.id}`)}
								onmouseenter={() => (nav.index = i)}
							>
								<Table.Cell class="max-w-56 truncate font-medium"
									><a href="/leases/{l.id}" class="outline-none">{l.tenants || '—'}</a></Table.Cell
								>
								<Table.Cell class="text-muted-foreground"
									>{l.propertyName} · {l.unitName}</Table.Cell
								>
								<Table.Cell class="hidden md:table-cell">
									<span class="text-muted-foreground"
										>{formatDate(l.startDate, true)} – {l.endDate
											? formatDate(l.endDate, true)
											: 'Month-to-month'}</span
									>
									{#if l.status === 'active' && l.endDate && l.endDate <= soon}<span
											class="ml-2 text-xs text-amber-600">ending soon</span
										>{/if}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums"
									>{formatMoney(l.rentAmount, l.currency)}</Table.Cell
								>
								<Table.Cell
									class="text-right tabular-nums {l.balance > 0
										? 'font-medium text-red-600 dark:text-red-400'
										: 'text-muted-foreground'}"
									>{l.balance ? formatMoney(l.balance, l.currency) : '—'}</Table.Cell
								>
								<Table.Cell class="hidden sm:table-cell"
									><StatusBadge status={l.status} /></Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	{/if}
</main>

<LeaseForm
	bind:open={creating}
	unitId={params.get('unit')}
	propertyId={params.get('property')}
	tenantId={params.get('tenant')}
/>
