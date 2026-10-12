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
	import RecordFields from '#lib/components/app/record-fields.svelte';
	import ViewSwitcher, { type ViewKind } from '#lib/components/app/view-switcher.svelte';
	import * as Table from '#lib/components/ui/table/index.js';
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
	import { bulkUpdateTickets } from '#lib/remote/bulk.remote.ts';
	import { aiSuggestVendor } from '#lib/remote/ai.remote.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import BulkBar from '#lib/components/app/bulk-bar.svelte';
	import { untrack } from 'svelte';
	import Mail from '@lucide/svelte/icons/mail';
	import LinkIcon from '@lucide/svelte/icons/link';
	import Copy from '@lucide/svelte/icons/copy';
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
	let reqView = $state<ViewKind>('kanban');
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

	const tableRows = $derived(
		columns.flatMap((c) => c.items).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
	);

	const picked = new SvelteSet<string>();
	const togglePick = (id: string, on: boolean) => (on ? picked.add(id) : picked.delete(id));
	const bulkApply = async (data: {
		status?: (typeof ticketStatuses)[number];
		priority?: (typeof ticketPriorities)[number];
		vendorId?: string | null;
	}) => {
		const ids = [...picked];
		if (!ids.length || !Object.values(data).some((x) => x !== undefined)) return;
		await bulkUpdateTickets({ ids, ...data }).catch((err) =>
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Update failed')
		);
		picked.clear();
		toast.success(`Updated ${ids.length} request${ids.length === 1 ? '' : 's'}`);
	};

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
	let suggesting = $state(false);

	async function suggestVendor(t: Ticket) {
		suggesting = true;
		try {
			const pick = await aiSuggestVendor(t.id);
			if (!pick) {
				toast.info('No vendor matches this kind of work');
				return;
			}
			await patch(t.id, { vendorId: pick.vendorId });
			toast.success(`Suggested ${pick.vendorName} — ${pick.reason}`);
		} catch (err) {
			toast.error(errMsg(err, 'Could not suggest a vendor'));
		} finally {
			suggesting = false;
		}
	}
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
				<span class="flex items-center gap-2 text-sm text-muted-foreground">
					<Checkbox id="maint-show-closed" bind:checked={showClosed} />
					<Label for="maint-show-closed" class="font-normal">Show all closed</Label>
				</span>
				{#if reqView === 'kanban'}
					<p class="ml-auto hidden text-xs text-muted-foreground md:block">
						Drag cards between columns to change status.
					</p>
				{/if}
				<ViewSwitcher views={['kanban', 'table']} bind:value={reqView} />
			</div>
			{#if reqView === 'table'}
				<div class="overflow-x-auto rounded-lg border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-8"></Table.Head>
								<Table.Head class="w-16">#</Table.Head>
								<Table.Head>Request</Table.Head>
								<Table.Head class="hidden md:table-cell">Where</Table.Head>
								<Table.Head class="hidden sm:table-cell">Vendor</Table.Head>
								<Table.Head class="w-24">Priority</Table.Head>
								<Table.Head class="w-28">Status</Table.Head>
								<Table.Head class="hidden text-right lg:table-cell">Updated</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each tableRows as t (t.id)}
								<Table.Row class="cursor-pointer" onclick={() => select(t)}>
									<Table.Cell class="w-8">
										<!-- Row click opens the ticket; the checkbox must not. -->
										<span role="presentation" onclick={(e) => e.stopPropagation()}>
											<Checkbox
												aria-label="Select #{t.number}"
												checked={picked.has(t.id)}
												onCheckedChange={(c) => togglePick(t.id, c === true)}
											/>
										</span>
									</Table.Cell>
									<Table.Cell class="text-xs text-muted-foreground tabular-nums"
										>{t.number}</Table.Cell
									>
									<Table.Cell class="max-w-64 truncate font-medium">{t.title}</Table.Cell>
									<Table.Cell class="hidden text-muted-foreground md:table-cell"
										>{t.propertyName}{t.unitName ? ` · ${t.unitName}` : ''}</Table.Cell
									>
									<Table.Cell class="hidden text-muted-foreground sm:table-cell"
										>{t.vendorName ?? '—'}</Table.Cell
									>
									<Table.Cell
										>{#if t.priority !== 'normal'}<StatusBadge
												status={t.priority}
											/>{:else}—{/if}</Table.Cell
									>
									<Table.Cell><StatusBadge status={t.status} /></Table.Cell>
									<Table.Cell class="hidden text-right text-xs text-muted-foreground lg:table-cell"
										>{formatRelative(t.updatedAt)}</Table.Cell
									>
								</Table.Row>
							{:else}
								<Table.Row
									><Table.Cell colspan={8} class="py-8 text-center text-muted-foreground"
										>No requests.</Table.Cell
									></Table.Row
								>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{:else}
				<div
					class="grid flex-1 snap-x snap-mandatory auto-cols-[minmax(min(16rem,80vw),1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
				>
					{#each columns as col (col.status)}
						<section
							class="flex min-h-48 snap-start flex-col rounded-lg bg-muted/40 p-2 transition-colors {over ===
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
			{/if}
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

<BulkBar
	count={picked.size}
	total={tableRows.length}
	onselectall={() => {
		if (picked.size === tableRows.length) picked.clear();
		else for (const t of tableRows) picked.add(t.id);
	}}
	onclear={() => picked.clear()}
>
	{#snippet actions()}
		<NativeSelect.Root
			aria-label="Set status"
			size="sm"
			value=""
			onchange={(e) =>
				bulkApply({ status: e.currentTarget.value as (typeof ticketStatuses)[number] })}
		>
			<NativeSelect.Option value="" disabled>Status…</NativeSelect.Option>
			{#each ticketStatuses as s (s)}
				<NativeSelect.Option value={s}>{label(s)}</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
		<NativeSelect.Root
			aria-label="Set priority"
			size="sm"
			value=""
			onchange={(e) =>
				bulkApply({ priority: e.currentTarget.value as (typeof ticketPriorities)[number] })}
		>
			<NativeSelect.Option value="" disabled>Priority…</NativeSelect.Option>
			{#each ticketPriorities as p (p)}
				<NativeSelect.Option value={p}>{p}</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
		<NativeSelect.Root
			aria-label="Assign vendor"
			size="sm"
			value=""
			onchange={(e) =>
				bulkApply({ vendorId: e.currentTarget.value === '__none' ? null : e.currentTarget.value })}
		>
			<NativeSelect.Option value="" disabled>Vendor…</NativeSelect.Option>
			<NativeSelect.Option value="__none">No vendor</NativeSelect.Option>
			{#each vendors as v (v.id)}
				<NativeSelect.Option value={v.id}>{v.name}</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
	{/snippet}
</BulkBar>

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
				{#if selected.duplicateOf}
					<p
						class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
					>
						<Copy class="mt-0.5 size-4 shrink-0" />
						<span
							>AI flagged this as a possible duplicate of
							<a class="font-medium underline" href="?ticket={selected.duplicateOf}"
								>#{selected.dupNumber} {selected.dupTitle}</a
							>.</span
						>
					</p>
				{/if}
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
							<div class="flex items-center gap-3">
								{#if page.data.ai}
									<button
										class="text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
										disabled={suggesting}
										onclick={() => suggestVendor(selected!)}
										>{suggesting ? 'Thinking…' : 'Ask AI'}</button
									>
								{/if}
								{#if selected.vendorId}<a
										href="/vendors/{selected.vendorId}"
										class="text-xs text-muted-foreground hover:underline">View vendor</a
									>{/if}
							</div>
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
					<RecordFields entity="ticket" recordId={selected.id} />
					{#snippet pending()}{/snippet}
				</svelte:boundary>
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
