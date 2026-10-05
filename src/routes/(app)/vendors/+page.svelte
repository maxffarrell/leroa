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
	import { getVendors } from '#lib/remote/vendors.remote.ts';
	import { formatMoney } from '#lib/format.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import HardHat from '@lucide/svelte/icons/hard-hat';

	let showArchived = $state(false);
	const vendors = $derived(await getVendors(showArchived));
	let search = $state('');
	let creating = $state(page.url.searchParams.has('new'));

	const rows = $derived(
		vendors.filter(
			(v) =>
				!search ||
				`${v.name} ${v.contactName ?? ''} ${v.trades.join(' ')} ${v.email ?? ''} ${v.phone ?? ''}`
					.toLowerCase()
					.includes(search.toLowerCase())
		)
	);

	const nav = new RowNav({
		count: () => rows.length,
		open: (i) => openHref(`/vendors/${rows[i]!.id}`),
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
					<Table.Row>
						<Table.Head>Vendor</Table.Head>
						<Table.Head class="hidden md:table-cell">Contact</Table.Head>
						<Table.Head class="text-right">Open jobs</Table.Head>
						<Table.Head class="hidden text-right lg:table-cell">Spent this year</Table.Head>
						<Table.Head class="hidden sm:table-cell">Insurance</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as v, i (v.id)}
						<Table.Row
							data-row={i}
							data-state={nav.index === i ? 'selected' : undefined}
							class="cursor-pointer {v.archivedAt ? 'opacity-60' : ''}"
							onclick={() => openHref(`/vendors/${v.id}`)}
							onmouseenter={() => (nav.index = i)}
						>
							<Table.Cell class="max-w-56">
								<a href="/vendors/{v.id}" class="block truncate font-medium outline-none"
									>{v.name}{v.archivedAt ? ' (archived)' : ''}</a
								>
								<span class="block truncate text-xs text-muted-foreground"
									>{v.trades.join(', ') || 'No trades set'}</span
								>
								<InsuranceBadge expiresOn={v.insuranceExpiresOn} class="mt-1 sm:hidden" />
							</Table.Cell>
							<Table.Cell class="hidden max-w-56 text-muted-foreground md:table-cell">
								<span class="block truncate">{v.contactName ?? v.email ?? '—'}</span>
								{#if v.phone}<span class="block truncate text-xs tabular-nums">{v.phone}</span>{/if}
							</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{v.openCount}<span class="text-muted-foreground"> / {v.jobCount}</span></Table.Cell
							>
							<Table.Cell class="hidden text-right tabular-nums lg:table-cell"
								>{formatMoney(v.spendYtd)}</Table.Cell
							>
							<Table.Cell class="hidden sm:table-cell"
								><InsuranceBadge expiresOn={v.insuranceExpiresOn} /></Table.Cell
							>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={5} class="py-8 text-center text-muted-foreground"
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
