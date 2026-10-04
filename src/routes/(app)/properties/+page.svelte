<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import PropertyForm from '#lib/components/app/property-form.svelte';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import { formatMoney } from '#lib/format.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Building2 from '@lucide/svelte/icons/building-2';

	const properties = $derived(await getProperties());
	let filter = $state('');
	let creating = $state(page.url.searchParams.has('new'));
	const rows = $derived(
		filter
			? properties.filter((p) =>
					`${p.name} ${p.addressLine1} ${p.city}`.toLowerCase().includes(filter.toLowerCase())
				)
			: properties
	);
	const nav = new RowNav({
		count: () => rows.length,
		open: (i) => openHref(`/properties/${rows[i]!.id}`),
		create: () => (creating = true)
	});

	$effect(() => {
		if (!creating && page.url.searchParams.has('new')) replaceState('/properties', {});
	});
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Properties">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> New <Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	{#if properties.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Building2 /></Empty.Media>
				<Empty.Title>No properties yet</Empty.Title>
				<Empty.Description>Add a building and its units in one step.</Empty.Description>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (creating = true)}><Plus /> Add property</Button></Empty.Content
			>
		</Empty.Root>
	{:else}
		<div class="mb-4 flex items-center gap-3">
			<Input placeholder="Filter properties…" class="max-w-xs" bind:value={filter} />
			<p class="ml-auto hidden text-xs text-muted-foreground md:block">
				<Kbd>J</Kbd>
				<Kbd>K</Kbd> to move, <Kbd>↵</Kbd> to open
			</p>
		</div>
		<div class="overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Property</Table.Head>
						<Table.Head class="hidden md:table-cell">Address</Table.Head>
						<Table.Head class="text-right">Units</Table.Head>
						<Table.Head class="text-right">Occupancy</Table.Head>
						<Table.Head class="hidden text-right sm:table-cell">Market rent</Table.Head>
						<Table.Head class="hidden text-right lg:table-cell">Open tickets</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as p, i (p.id)}
						<Table.Row
							data-row={i}
							data-state={nav.index === i ? 'selected' : undefined}
							class="cursor-pointer"
							onclick={() => openHref(`/properties/${p.id}`)}
							onmouseenter={() => (nav.index = i)}
						>
							<Table.Cell class="font-medium"
								><a href="/properties/{p.id}" class="outline-none">{p.name}</a></Table.Cell
							>
							<Table.Cell class="hidden text-muted-foreground md:table-cell"
								>{[p.addressLine1, p.city, p.region].filter(Boolean).join(', ')}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums">{p.units}</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{p.units ? Math.round((p.occupied / p.units) * 100) : 0}%</Table.Cell
							>
							<Table.Cell class="hidden text-right tabular-nums sm:table-cell"
								>{formatMoney(p.marketRent)}</Table.Cell
							>
							<Table.Cell class="hidden text-right tabular-nums lg:table-cell"
								>{p.openTickets || '—'}</Table.Cell
							>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<PropertyForm bind:open={creating} />
