<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import OwnerDialog from '#lib/components/app/owner-dialog.svelte';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { getOwners } from '#lib/remote/owners.remote.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Landmark from '@lucide/svelte/icons/landmark';

	let showArchived = $state(false);
	const owners = $derived(await getOwners(showArchived));
	let search = $state('');
	let creating = $state(page.url.searchParams.has('new'));
	const initialPropertyIds = page.url.searchParams.getAll('property');

	const rows = $derived(
		owners.filter(
			(o) =>
				!search ||
				`${o.name} ${o.email ?? ''} ${o.phone ?? ''} ${o.properties.join(' ')}`
					.toLowerCase()
					.includes(search.toLowerCase())
		)
	);

	const nav = new RowNav({
		count: () => rows.length,
		open: (i) => openHref(`/owners/${rows[i]!.id}`),
		create: () => (creating = true)
	});
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Owners">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> <span class="hidden sm:inline">New owner</span>
			<Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	{#if owners.length === 0 && !showArchived}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Landmark /></Empty.Media>
				<Empty.Title>No owners yet</Empty.Title>
				<Empty.Description
					>Add the people or companies who own the properties you manage. Each gets a read-only
					portal with occupancy, rent collection and maintenance.</Empty.Description
				>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (creating = true)}><Plus /> New owner</Button></Empty.Content
			>
		</Empty.Root>
	{:else}
		<div class="mb-3 flex flex-wrap items-center gap-3">
			<Input
				placeholder="Filter by name, property…"
				class="h-8 max-w-64"
				bind:value={search}
				oninput={() => (nav.index = -1)}
			/>
			<label class="flex items-center gap-2 text-sm text-muted-foreground"
				><input type="checkbox" bind:checked={showArchived} class="accent-primary" /> Show archived</label
			>
		</div>
		<div class="overflow-x-auto rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Owner</Table.Head>
						<Table.Head class="hidden md:table-cell">Properties</Table.Head>
						<Table.Head class="text-right">Units</Table.Head>
						<Table.Head class="hidden sm:table-cell">Portal</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as o, i (o.id)}
						<Table.Row
							data-row={i}
							data-state={nav.index === i ? 'selected' : undefined}
							class="cursor-pointer {o.archivedAt ? 'opacity-60' : ''}"
							onclick={() => openHref(`/owners/${o.id}`)}
							onmouseenter={() => (nav.index = i)}
						>
							<Table.Cell class="max-w-56">
								<a href="/owners/{o.id}" class="block truncate font-medium outline-none"
									>{o.name}{o.archivedAt ? ' (archived)' : ''}</a
								>
								<span class="block truncate text-xs text-muted-foreground md:hidden"
									>{o.properties.join(', ') || 'No properties'}</span
								>
								{#if o.email}<span class="hidden truncate text-xs text-muted-foreground md:block"
										>{o.email}</span
									>{/if}
							</Table.Cell>
							<Table.Cell class="hidden max-w-72 truncate text-muted-foreground md:table-cell"
								>{o.properties.join(', ') || '—'}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">{o.unitCount}</Table.Cell>
							<Table.Cell class="hidden text-muted-foreground sm:table-cell"
								>{o.portalLinked ? 'Linked' : 'Not invited'}</Table.Cell
							>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={4} class="py-8 text-center text-muted-foreground"
								>No owners match.</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<OwnerDialog
	bind:open={creating}
	{initialPropertyIds}
	onsaved={(o) => openHref(`/owners/${o.id}`)}
/>
