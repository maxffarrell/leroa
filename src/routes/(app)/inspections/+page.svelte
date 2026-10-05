<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import NewInspectionDialog from '#lib/components/app/new-inspection-dialog.svelte';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { getInspections } from '#lib/remote/inspections.remote.ts';
	import { KIND_LABEL, type InspectionKind } from '#lib/inspections.ts';
	import { formatDate } from '#lib/format.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import MessageSquare from '@lucide/svelte/icons/message-square';

	const all = $derived(await getInspections());
	let tab = $state<'open' | 'completed'>('open');
	let creating = $state(page.url.searchParams.has('new'));
	let unitId = $state(page.url.searchParams.get('unit') ?? '');
	let kind = $state<InspectionKind>(
		(page.url.searchParams.get('kind') as InspectionKind | null) ?? 'move_in'
	);

	const rows = $derived(
		all.filter((i) => (tab === 'open' ? i.status === 'in_progress' : i.status === 'completed'))
	);
	const openCount = $derived(all.filter((i) => i.status === 'in_progress').length);

	const nav = new RowNav({
		count: () => rows.length,
		open: (i) => openHref(`/inspections/${rows[i]!.id}`),
		create: () => (creating = true)
	});
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Inspections">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> <span class="hidden sm:inline">New inspection</span>
			<Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	{#if all.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><ClipboardCheck /></Empty.Media>
				<Empty.Title>No inspections yet</Empty.Title>
				<Empty.Description
					>Walk a unit at move-in, move-out or any time in between. Rate each item, add photos, and
					Leroa saves a PDF report to the lease.</Empty.Description
				>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (creating = true)}><Plus /> New inspection</Button></Empty.Content
			>
		</Empty.Root>
	{:else}
		<Tabs.Root bind:value={tab} class="mb-3" onValueChange={() => (nav.index = -1)}>
			<Tabs.List>
				<Tabs.Trigger value="open"
					>In progress <span class="ml-1 text-xs text-muted-foreground">{openCount}</span
					></Tabs.Trigger
				>
				<Tabs.Trigger value="completed"
					>Completed <span class="ml-1 text-xs text-muted-foreground">{all.length - openCount}</span
					></Tabs.Trigger
				>
			</Tabs.List>
		</Tabs.Root>
		<div class="overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Unit</Table.Head>
						<Table.Head class="hidden sm:table-cell">Type</Table.Head>
						<Table.Head class="text-right">Items</Table.Head>
						<Table.Head class="hidden md:table-cell">Date</Table.Head>
						<Table.Head class="hidden sm:table-cell">Status</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as i, n (i.id)}
						<Table.Row
							data-row={n}
							data-state={nav.index === n ? 'selected' : undefined}
							class="cursor-pointer"
							onclick={() => openHref(`/inspections/${i.id}`)}
							onmouseenter={() => (nav.index = n)}
						>
							<Table.Cell class="max-w-56">
								<a href="/inspections/{i.id}" class="block truncate font-medium outline-none"
									>{i.propertyName} · {i.unitName}</a
								>
								<span class="block text-xs text-muted-foreground sm:hidden"
									>{KIND_LABEL[i.kind]} · {formatDate(i.completedAt ?? i.scheduledFor, true)}</span
								>
							</Table.Cell>
							<Table.Cell class="hidden sm:table-cell">{KIND_LABEL[i.kind]}</Table.Cell>
							<Table.Cell class="text-right tabular-nums">
								<span class="inline-flex items-center gap-2">
									{#if i.flagged}<span
											class="inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-400"
											title="{i.flagged} poor or damaged"
											><TriangleAlert class="size-3" />{i.flagged}</span
										>{/if}
									{#if i.hasTenantComment}<MessageSquare
											class="size-3.5 text-amber-600"
											aria-label="Resident left comments"
										/>{/if}
									{#if i.status === 'in_progress'}{i.rated}<span class="text-muted-foreground"
											>/{i.total}</span
										>{:else}{i.total}{/if}
								</span>
							</Table.Cell>
							<Table.Cell class="hidden text-muted-foreground tabular-nums md:table-cell"
								>{formatDate(i.completedAt ?? i.scheduledFor)}</Table.Cell
							>
							<Table.Cell class="hidden sm:table-cell">
								<StatusBadge status={i.status} />
								{#if i.status === 'completed' && i.leaseId && i.kind !== 'routine'}
									<span class="ml-1 text-xs text-muted-foreground"
										>{i.acknowledgedAt ? 'Reviewed by resident' : 'Awaiting resident'}</span
									>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={5} class="py-8 text-center text-muted-foreground"
								>{tab === 'open'
									? 'Nothing in progress.'
									: 'No completed inspections yet.'}</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<NewInspectionDialog bind:open={creating} bind:unitId bind:kind />
