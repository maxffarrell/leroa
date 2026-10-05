<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import {
		getProperty,
		createUnit,
		updateUnit,
		deleteUnit,
		archiveProperty
	} from '#lib/remote/portfolio.remote.ts';
	import { createListing } from '#lib/remote/listings.remote.ts';
	import { getPropertyOwners } from '#lib/remote/owners.remote.ts';
	import { unitStatuses } from '#lib/schemas.ts';
	import { formatMoney, formatDate } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Wrench from '@lucide/svelte/icons/wrench';
	import FileSignature from '@lucide/svelte/icons/file-signature';

	const id = $derived(page.params.id!);
	const p = $derived(await getProperty(id));
	const owners = $derived(await getPropertyOwners(id));
	const occupied = $derived(p.units.filter((u) => u.status === 'occupied').length);
	const scheduled = $derived(p.units.reduce((s, u) => s + (u.leaseRent ?? 0), 0));
	const highlighted = $derived(page.url.searchParams.get('unit'));

	let newUnit = $state('');
	let adding = $state(false);

	const message = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	async function addUnit(e: SubmitEvent) {
		e.preventDefault();
		if (!newUnit.trim()) return;
		adding = true;
		try {
			await createUnit({ propertyId: id, name: newUnit.trim() });
			newUnit = '';
		} catch (err) {
			toast.error(message(err, 'Could not add unit'));
		} finally {
			adding = false;
		}
	}

	async function setStatus(unitId: string, status: (typeof unitStatuses)[number]) {
		await updateUnit({ id: unitId, status }).catch((err) =>
			toast.error(message(err, 'Update failed'))
		);
	}

	async function setRent(unitId: string, marketRent: number | null) {
		await updateUnit({ id: unitId, marketRent }).catch((err) =>
			toast.error(message(err, 'Update failed'))
		);
	}

	async function removeUnit(unitId: string) {
		try {
			await deleteUnit({ id: unitId, propertyId: id });
			toast.success('Unit removed');
		} catch (err) {
			toast.error(message(err, 'Could not remove unit'));
		}
	}

	async function listUnit(unitId: string) {
		try {
			const { id: listingId } = await createListing({ unitId });
			await goto(`/leasing/listings/${listingId}`);
		} catch (err) {
			toast.error(message(err, 'Could not create listing'));
		}
	}

	async function archive() {
		if (!confirm(`Archive ${p.name}? It will be hidden from lists.`)) return;
		await archiveProperty(id);
		toast.success('Property archived');
		await goto('/properties');
	}
</script>

<PageHeader title={p.name} crumbs={[{ label: 'Properties', href: '/properties' }]}>
	{#snippet actions()}
		<Button size="sm" variant="outline" href="/maintenance?new=1&property={id}"
			><Wrench /> <span class="hidden sm:inline">Request</span></Button
		>
		<Button size="sm" href="/leases?new=1&property={id}"
			><FileSignature /> <span class="hidden sm:inline">New lease</span></Button
		>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}<Button
						size="icon-sm"
						variant="ghost"
						aria-label="More"
						{...props}><Ellipsis /></Button
					>{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item variant="destructive" onclick={archive}
					>Archive property</DropdownMenu.Item
				>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</PageHeader>

<main class="space-y-6 p-4 md:p-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight">{p.name}</h1>
		<p class="text-sm text-muted-foreground">
			{[p.addressLine1, p.city, p.region, p.postalCode].filter(Boolean).join(', ') || 'No address'}
		</p>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if owners.length}
				Owned by {#each owners as o, i (o.id)}{i ? ', ' : ''}<a
						href="/owners/{o.id}"
						class="text-foreground hover:underline">{o.name}</a
					>{/each}
			{:else}
				No owner set · <a href="/owners?new=1&property={id}" class="text-foreground hover:underline"
					>Add owner</a
				>
			{/if}
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<Card.Root size="sm"
			><Card.Header
				><Card.Description>Units</Card.Description><Card.Title class="text-xl tabular-nums"
					>{p.units.length}</Card.Title
				></Card.Header
			></Card.Root
		>
		<Card.Root size="sm"
			><Card.Header
				><Card.Description>Occupied</Card.Description><Card.Title class="text-xl tabular-nums"
					>{occupied}
					<span class="text-sm font-normal text-muted-foreground">/ {p.units.length}</span
					></Card.Title
				></Card.Header
			></Card.Root
		>
		<Card.Root size="sm"
			><Card.Header
				><Card.Description>Scheduled rent / mo</Card.Description><Card.Title
					class="text-xl tabular-nums">{formatMoney(scheduled)}</Card.Title
				></Card.Header
			></Card.Root
		>
	</div>

	<div class="overflow-hidden rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Unit</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head class="text-right">Market rent</Table.Head>
					<Table.Head class="hidden text-right sm:table-cell">Lease rent</Table.Head>
					<Table.Head class="hidden md:table-cell">Lease ends</Table.Head>
					<Table.Head class="w-10"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each p.units as u (u.id)}
					<Table.Row data-state={highlighted === u.id ? 'selected' : undefined}>
						<Table.Cell class="font-medium">{u.name}</Table.Cell>
						<Table.Cell>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger
									class="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								>
									<StatusBadge status={u.status} />
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="start">
									{#each unitStatuses as s (s)}
										<DropdownMenu.Item onclick={() => setStatus(u.id, s)}
											><StatusBadge status={s} /></DropdownMenu.Item
										>
									{/each}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</Table.Cell>
						<Table.Cell class="text-right">
							<Popover.Root>
								<Popover.Trigger class="rounded px-1 tabular-nums hover:bg-muted"
									>{u.marketRent != null ? formatMoney(u.marketRent) : '—'}</Popover.Trigger
								>
								<Popover.Content class="w-48" align="end">
									<form onsubmit={(e) => e.preventDefault()}>
										<MoneyInput bind:value={() => u.marketRent, (v) => setRent(u.id, v)} />
									</form>
								</Popover.Content>
							</Popover.Root>
						</Table.Cell>
						<Table.Cell class="hidden text-right tabular-nums sm:table-cell">
							{#if u.leaseId}<a class="hover:underline" href="/leases/{u.leaseId}"
									>{formatMoney(u.leaseRent)}</a
								>{:else}—{/if}
						</Table.Cell>
						<Table.Cell class="hidden text-muted-foreground md:table-cell"
							>{u.leaseId
								? u.leaseEnd
									? formatDate(u.leaseEnd)
									: 'Month-to-month'
								: ''}</Table.Cell
						>
						<Table.Cell>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}<Button
											size="icon-sm"
											variant="ghost"
											aria-label="Unit actions"
											{...props}><Ellipsis /></Button
										>{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Item onclick={() => goto(`/leases?new=1&unit=${u.id}`)}
										>New lease</DropdownMenu.Item
									>
									<DropdownMenu.Item
										onclick={() => goto(`/maintenance?new=1&property=${id}&unit=${u.id}`)}
										>New request</DropdownMenu.Item
									>
									<DropdownMenu.Item onclick={() => listUnit(u.id)}>List for rent</DropdownMenu.Item
									>
									<DropdownMenu.Separator />
									<DropdownMenu.Item variant="destructive" onclick={() => removeUnit(u.id)}
										>Remove unit</DropdownMenu.Item
									>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
				<Table.Row class="hover:bg-transparent">
					<Table.Cell colspan={6}>
						<form class="flex items-center gap-2" onsubmit={addUnit}>
							<Input class="h-8 max-w-48" placeholder="Add unit, e.g. 204" bind:value={newUnit} />
							<Button type="submit" size="sm" variant="ghost" disabled={adding || !newUnit.trim()}
								><Plus /> Add</Button
							>
						</form>
					</Table.Cell>
				</Table.Row>
			</Table.Body>
		</Table.Root>
	</div>
</main>
