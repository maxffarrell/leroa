<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import VendorDialog from '#lib/components/app/vendor-dialog.svelte';
	import InsuranceBadge from '#lib/components/app/insurance-badge.svelte';
	import RecordFields from '#lib/components/app/record-fields.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { getVendor, updateVendor } from '#lib/remote/vendors.remote.ts';
	import { formatDate, formatMoney, formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Plus from '@lucide/svelte/icons/plus';

	const v = $derived(await getVendor(page.params.id!));
	let editing = $state(false);

	const isOpen = (s: string) => s === 'open' || s === 'in_progress' || s === 'on_hold';
	const year = new Date().getFullYear();
	const stats = $derived({
		open: v.jobs.filter((j) => isOpen(j.status)).length,
		total: v.jobs.length,
		spendYtd: v.jobs
			.filter(
				(j) => j.status === 'done' && j.closedAt && new Date(j.closedAt).getFullYear() === year
			)
			.reduce((s, j) => s + (j.costAmount ?? 0), 0)
	});

	async function setArchived(archived: boolean) {
		try {
			await updateVendor({ id: v.id, archived });
			toast.success(archived ? `${v.name} archived` : `${v.name} restored`);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not update');
		}
	}
</script>

<PageHeader title={v.name} crumbs={[{ label: 'Vendors', href: '/vendors' }]}>
	{#snippet actions()}
		<Button size="sm" variant="outline" onclick={() => (editing = true)}
			><Pencil /> <span class="hidden sm:inline">Edit</span></Button
		>
		{#if page.data.role !== 'member'}
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
					{#if v.archivedAt}
						<DropdownMenu.Item onclick={() => setArchived(false)}>Restore vendor</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item variant="destructive" onclick={() => setArchived(true)}
							>Archive vendor</DropdownMenu.Item
						>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/snippet}
</PageHeader>

<main class="grid gap-6 p-4 md:p-6 lg:grid-cols-[1fr_20rem]">
	<section class="min-w-0 space-y-4 lg:order-1">
		<div class="grid grid-cols-3 gap-3">
			{#each [['Open jobs', String(stats.open)], ['All jobs', String(stats.total)], ['Spent this year', formatMoney(stats.spendYtd)]] as [label, value] (label)}
				<div class="rounded-lg border p-3">
					<p class="text-xs text-muted-foreground">{label}</p>
					<p class="mt-1 text-lg font-semibold tabular-nums">{value}</p>
				</div>
			{/each}
		</div>
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-medium">Work orders</h2>
			<Button size="sm" variant="ghost" href="/maintenance?new"><Plus /> New request</Button>
		</div>
		<div class="overflow-x-auto rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Request</Table.Head>
						<Table.Head class="hidden sm:table-cell">Where</Table.Head>
						<Table.Head class="text-right">Cost</Table.Head>
						<Table.Head>Status</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each v.jobs as j (j.id)}
						<Table.Row>
							<Table.Cell class="max-w-64">
								<a
									href="/maintenance?ticket={j.id}"
									class="block truncate font-medium hover:underline"
									><span class="text-muted-foreground tabular-nums">#{j.number}</span> {j.title}</a
								>
								<span class="block truncate text-xs text-muted-foreground"
									><span class="sm:hidden">{j.propertyName} · </span>{formatRelative(
										j.createdAt
									)}</span
								>
							</Table.Cell>
							<Table.Cell class="hidden text-muted-foreground sm:table-cell"
								>{j.propertyName}{j.unitName ? ` · ${j.unitName}` : ''}</Table.Cell
							>
							<Table.Cell class="text-right tabular-nums"
								>{j.costAmount == null ? '—' : formatMoney(j.costAmount)}</Table.Cell
							>
							<Table.Cell><StatusBadge status={j.status} /></Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={4} class="py-8 text-center text-muted-foreground"
								>No work orders yet. Assign {v.name} from a maintenance request.</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>

	<Card.Root class="h-fit lg:order-2">
		<Card.Header>
			<Card.Title>{v.contactName ?? 'Contact'}</Card.Title>
			<Card.Description>{v.trades.join(', ') || 'No trades set'}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3 text-sm">
			{#if v.email}
				<a href="mailto:{v.email}" class="flex items-center gap-2 hover:underline"
					><Mail class="size-4 text-muted-foreground" />{v.email}</a
				>
			{/if}
			{#if v.phone}
				<a href="tel:{v.phone}" class="flex items-center gap-2 tabular-nums hover:underline"
					><Phone class="size-4 text-muted-foreground" />{v.phone}</a
				>
			{/if}
			{#if !v.email && !v.phone}<p class="text-muted-foreground">No contact details.</p>{/if}
			<div>
				<p class="text-xs text-muted-foreground">Insurance</p>
				<InsuranceBadge expiresOn={v.insuranceExpiresOn} class="mt-1" />
			</div>
			{#if v.notes}
				<div>
					<p class="text-xs text-muted-foreground">Notes</p>
					<p class="mt-1 whitespace-pre-line">{v.notes}</p>
				</div>
			{/if}
			<p class="text-xs text-muted-foreground">Added {formatDate(v.createdAt)}</p>
		</Card.Content>
	</Card.Root>

	<svelte:boundary>
		<RecordFields entity="vendor" recordId={v.id} />
		{#snippet pending()}{/snippet}
	</svelte:boundary>
</main>

<VendorDialog bind:open={editing} vendor={v} />
