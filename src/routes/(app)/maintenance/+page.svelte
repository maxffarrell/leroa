<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import TicketForm from '#lib/components/app/ticket-form.svelte';
	import { isTypingTarget } from '#lib/components/app/keys.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import InsuranceBadge from '#lib/components/app/insurance-badge.svelte';
	import VendorDialog from '#lib/components/app/vendor-dialog.svelte';
	import TicketActivity from '#lib/components/app/ticket-activity.svelte';
	import TurnBoard from '#lib/components/app/turn-board.svelte';
	import SchedulesView from '#lib/components/app/schedules-view.svelte';
	import AssetsView from '#lib/components/app/assets-view.svelte';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import {
		getTickets,
		getWorkOrderLink,
		sendWorkOrder,
		updateTicket
	} from '#lib/remote/maintenance.remote.ts';
	import { getVendors } from '#lib/remote/vendors.remote.ts';
	import { untrack } from 'svelte';
	import Mail from '@lucide/svelte/icons/mail';
	import LinkIcon from '@lucide/svelte/icons/link';
	import HardHat from '@lucide/svelte/icons/hard-hat';
	import { ticketPriorities, ticketStatuses } from '#lib/schemas.ts';
	import { formatRelative, tenantName } from '#lib/format.ts';
	import type { Ticket } from '#lib/server/services/maintenance.ts';
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';

	const tickets = $derived(await getTickets());
	const vendors = $derived(await getVendors(false));
	const params = page.url.searchParams;
	const TAB_NAMES = ['requests', 'turns', 'schedules', 'assets'];
	let tab = $state(
		params.has('ticket') || params.has('new') || params.has('property')
			? 'requests'
			: TAB_NAMES.includes(params.get('tab') ?? '')
				? (params.get('tab') as string)
				: 'requests'
	);
	let creating = $state(params.has('new'));
	let search = $state('');
	let showClosed = $state(false);
	let dragging = $state<string | null>(null);
	let over = $state<string | null>(null);

	const columns = $derived(
		(showClosed ? ticketStatuses : ticketStatuses.filter((s) => s !== 'cancelled')).map(
			(status) => ({
				status,
				items: tickets.filter(
					(t) =>
						t.status === status &&
						(!search ||
							`#${t.number} ${t.title} ${t.propertyName} ${t.unitName ?? ''} ${t.vendorName ?? ''}`
								.toLowerCase()
								.includes(search.toLowerCase())) &&
						(status !== 'done' ||
							showClosed ||
							Date.now() - new Date(t.updatedAt).getTime() < 14 * 86400_000)
				)
			})
		)
	);

	const selectedId = $derived(page.url.searchParams.get('ticket'));
	const selected = $derived(tickets.find((t) => t.id === selectedId) ?? null);
	const select = (t: Ticket | null) => goto(t ? `?ticket=${t.id}` : '?', { replaceState: true });

	async function patch(
		id: string,
		data: Partial<
			Pick<Ticket, 'status' | 'priority' | 'vendorId' | 'costAmount' | 'description' | 'title'>
		>
	) {
		await updateTicket({ id, ...data }).catch((err) =>
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Update failed')
		);
	}

	function drop(status: (typeof ticketStatuses)[number]) {
		const t = tickets.find((x) => x.id === dragging);
		if (t && t.status !== status) void patch(t.id, { status });
		dragging = over = null;
	}

	function onkeydown(e: KeyboardEvent) {
		if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
		if (e.key === 'c') {
			e.preventDefault();
			creating = true;
		}
	}

	const label = (s: string) => s.replace('_', ' ');

	let addingVendor = $state(false);
	let sending = $state(false);
	let cost = $state<number | null>(null);
	const selectedVendor = $derived(vendors.find((v) => v.id === selected?.vendorId) ?? null);

	$effect.pre(() => {
		const next = selected?.costAmount ?? null;
		void selected?.id;
		untrack(() => (cost = next));
	});

	const errMsg = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	async function sendToVendor(t: Ticket) {
		sending = true;
		try {
			await sendWorkOrder(t.id);
			toast.success(`Work order emailed to ${t.vendorName}`);
		} catch (err) {
			toast.error(errMsg(err, 'Could not send'));
		} finally {
			sending = false;
		}
	}

	async function copyLink(t: Ticket) {
		try {
			const { path } = await getWorkOrderLink(t.id);
			await navigator.clipboard.writeText(`${location.origin}${path}`);
			toast.success('Link copied. Anyone with it can view and update this job.');
		} catch (err) {
			toast.error(errMsg(err, 'Could not copy link'));
		}
	}
</script>

<svelte:window {onkeydown} />

<PageHeader title="Maintenance">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> New <Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
	<Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col gap-4">
		<Tabs.List class="max-w-full justify-start overflow-x-auto">
			<Tabs.Trigger value="requests"
				>Requests <span class="ml-1 text-xs text-muted-foreground tabular-nums"
					>{tickets.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length}</span
				></Tabs.Trigger
			>
			<Tabs.Trigger value="turns">Turns</Tabs.Trigger>
			<Tabs.Trigger value="schedules">Schedules</Tabs.Trigger>
			<Tabs.Trigger value="assets">Assets</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="requests" class="flex min-h-0 flex-1 flex-col gap-4">
			<div class="flex flex-wrap items-center gap-3">
				<Input placeholder="Filter requests…" class="h-8 max-w-64" bind:value={search} />
				<label class="flex items-center gap-2 text-sm text-muted-foreground"
					><input type="checkbox" bind:checked={showClosed} class="accent-primary" /> Show all closed</label
				>
				<p class="ml-auto hidden text-xs text-muted-foreground md:block">
					Drag cards between columns to change status.
				</p>
			</div>
			<div
				class="grid flex-1 auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
			>
				{#each columns as col (col.status)}
					<section
						class="flex min-h-48 flex-col rounded-lg bg-muted/40 p-2 transition-colors {over ===
						col.status
							? 'bg-muted ring-2 ring-ring/30'
							: ''}"
						aria-label={label(col.status)}
						ondragover={(e) => {
							e.preventDefault();
							over = col.status;
						}}
						ondragleave={() => over === col.status && (over = null)}
						ondrop={() => drop(col.status)}
					>
						<header class="flex items-center gap-2 px-1.5 pb-2 text-sm font-medium capitalize">
							{label(col.status)}
							<span class="text-xs text-muted-foreground tabular-nums">{col.items.length}</span>
						</header>
						<ul class="flex flex-col gap-2">
							{#each col.items as t (t.id)}
								<li>
									<button
										type="button"
										draggable="true"
										ondragstart={() => (dragging = t.id)}
										ondragend={() => (dragging = over = null)}
										onclick={() => select(t)}
										class="w-full rounded-md border bg-card p-3 text-left shadow-xs transition hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {dragging ===
										t.id
											? 'opacity-50'
											: ''}"
									>
										<div class="flex items-start gap-2">
											<span class="text-xs text-muted-foreground tabular-nums">#{t.number}</span>
											<span class="flex-1 text-sm leading-snug font-medium">{t.title}</span>
										</div>
										<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
											{#if t.priority !== 'normal'}<StatusBadge status={t.priority} />{/if}
											<span class="truncate"
												>{t.propertyName}{t.unitName ? ` · ${t.unitName}` : ''}</span
											>
											<span class="ml-auto shrink-0">{formatRelative(t.createdAt)}</span>
										</div>
										{#if t.vendorName}
											<p
												class="mt-1.5 flex items-center gap-1 truncate text-xs text-muted-foreground"
											>
												<HardHat class="size-3 shrink-0" />{t.vendorName}
											</p>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		</Tabs.Content>
		<Tabs.Content value="turns" class="flex min-h-0 flex-1 flex-col gap-4">
			<TurnBoard />
		</Tabs.Content>
		<Tabs.Content value="schedules" class="flex min-h-0 flex-1 flex-col gap-4">
			<SchedulesView />
		</Tabs.Content>
		<Tabs.Content value="assets" class="flex min-h-0 flex-1 flex-col gap-4">
			<AssetsView />
		</Tabs.Content>
	</Tabs.Root>
</main>

<Sheet.Root open={!!selected} onOpenChange={(o) => !o && select(null)}>
	<Sheet.Content class="w-full gap-0 sm:max-w-md">
		{#if selected}
			<Sheet.Header>
				<Sheet.Description
					>#{selected.number} · {selected.propertyName}{selected.unitName
						? ` · ${selected.unitName}`
						: ''}{selected.assetName ? ` · ${selected.assetName}` : ''}{selected.scheduleId
						? ' · recurring'
						: ''}</Sheet.Description
				>
				<Sheet.Title class="text-lg">{selected.title}</Sheet.Title>
			</Sheet.Header>
			<div class="space-y-4 overflow-y-auto px-4 pb-4">
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label>Status</Field.Label>
						<Select.Root
							type="single"
							value={selected.status}
							onValueChange={(v) => patch(selected!.id, { status: v as Ticket['status'] })}
						>
							<Select.Trigger class="w-full capitalize">{label(selected.status)}</Select.Trigger>
							<Select.Content
								>{#each ticketStatuses as s (s)}<Select.Item value={s} class="capitalize"
										>{label(s)}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label>Priority</Field.Label>
						<Select.Root
							type="single"
							value={selected.priority}
							onValueChange={(v) => patch(selected!.id, { priority: v as Ticket['priority'] })}
						>
							<Select.Trigger class="w-full capitalize">{selected.priority}</Select.Trigger>
							<Select.Content
								>{#each ticketPriorities as p (p)}<Select.Item value={p} class="capitalize"
										>{p}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
				</div>
				<section class="space-y-3 rounded-lg border p-3" aria-label="Vendor">
					<Field.Field>
						<div class="flex items-center justify-between">
							<Field.Label>Vendor</Field.Label>
							{#if selected.vendorId}<a
									href="/vendors/{selected.vendorId}"
									class="text-xs text-muted-foreground hover:underline">View vendor</a
								>{/if}
						</div>
						<Select.Root
							type="single"
							value={selected.vendorId ?? '__none'}
							onValueChange={(v) =>
								v === '__new'
									? (addingVendor = true)
									: patch(selected!.id, { vendorId: v === '__none' ? null : v })}
						>
							<Select.Trigger class="w-full"
								><span class="truncate">{selected.vendorName ?? 'Unassigned'}</span></Select.Trigger
							>
							<Select.Content>
								<Select.Item value="__none">Unassigned</Select.Item>
								{#each vendors as v (v.id)}
									<Select.Item value={v.id} label={v.name}
										>{v.name}<span class="ml-auto pl-3 text-xs text-muted-foreground"
											>{v.trades[0] ?? ''}</span
										></Select.Item
									>
								{/each}
								<Select.Item value="__new" label="New vendor">
									<Plus class="size-4" /> New vendor…</Select.Item
								>
							</Select.Content>
						</Select.Root>
					</Field.Field>
					{#if selected.vendorId}
						{#if selectedVendor}<InsuranceBadge
								expiresOn={selectedVendor.insuranceExpiresOn}
							/>{/if}
						<div class="flex flex-wrap gap-2">
							<Button
								size="sm"
								disabled={sending ||
									!selected.vendorEmail ||
									selected.status === 'done' ||
									selected.status === 'cancelled'}
								title={selected.vendorEmail
									? undefined
									: 'Add an email address to this vendor first'}
								onclick={() => sendToVendor(selected!)}
								><Mail />{sending
									? 'Sending…'
									: selected.vendorSentAt
										? 'Resend work order'
										: 'Send work order'}</Button
							>
							<Button size="sm" variant="outline" onclick={() => copyLink(selected!)}
								><LinkIcon /> Copy link</Button
							>
						</div>
						<p class="text-xs text-muted-foreground">
							{selected.vendorSentAt
								? `Emailed ${formatRelative(selected.vendorSentAt)}.`
								: selected.vendorEmail
									? 'Not sent yet.'
									: 'No email on file. Copy the link and text it instead.'}
							The vendor can post updates, photos and the cost from the link.
						</p>
					{/if}
					<Field.Field class="max-w-48">
						<Field.Label for="tk-cost">Cost</Field.Label>
						<div
							onfocusout={() =>
								cost !== (selected?.costAmount ?? null) &&
								patch(selected!.id, { costAmount: cost })}
						>
							<MoneyInput id="tk-cost" placeholder="—" bind:value={cost} />
						</div>
					</Field.Field>
				</section>
				<Field.Field>
					<Field.Label for="tk-desc2">Details</Field.Label>
					<Textarea
						id="tk-desc2"
						rows={6}
						value={selected.description ?? ''}
						onchange={(e) => patch(selected!.id, { description: e.currentTarget.value || null })}
					/>
				</Field.Field>
				{#if selected.tenantId}
					<p class="text-sm">
						Reported by <a class="font-medium hover:underline" href="/tenants/{selected.tenantId}"
							>{tenantName({
								firstName: selected.tenantFirstName ?? '',
								lastName: selected.tenantLastName ?? ''
							})}</a
						>
					</p>
				{/if}
				<svelte:boundary>
					<TicketActivity ticketId={selected.id} />
					{#snippet pending()}<p class="text-sm text-muted-foreground">Loading notes…</p>{/snippet}
				</svelte:boundary>
				<p class="text-xs text-muted-foreground">
					Opened {formatRelative(selected.createdAt)} · updated {formatRelative(selected.updatedAt)}
				</p>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<VendorDialog
	bind:open={addingVendor}
	onsaved={(v) => selected && patch(selected.id, { vendorId: v.id })}
/>

<TicketForm bind:open={creating} propertyId={params.get('property')} unitId={params.get('unit')} />
