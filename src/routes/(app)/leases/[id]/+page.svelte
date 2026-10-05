<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import PaymentDialog, { type PaymentTarget } from '#lib/components/app/payment-dialog.svelte';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import LateFeeDialog from '#lib/components/app/late-fee-dialog.svelte';
	import RenewLeaseDialog from '#lib/components/app/renew-lease-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { getLease, updateLease, addCharge, deletePayment } from '#lib/remote/leasing.remote.ts';
	import { formatDate, formatMoney, tenantName, todayISO } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import Banknote from '@lucide/svelte/icons/banknote';

	const id = $derived(page.params.id!);
	const l = $derived(await getLease(id));
	const title = $derived(`${l.propertyName} · ${l.unitName}`);
	let payment = $state<PaymentTarget | null>(null);
	let tab = $state('charges');
	let renewOpen = $state(false);
	let lateFeeOpen = $state(false);

	let feeAmount = $state<number | null>(null);
	let feeDesc = $state('Late fee');
	let feeDate = $state(todayISO());
	let feeOpen = $state(false);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	async function setStatus(status: 'active' | 'ended' | 'terminated') {
		await updateLease({ id, status }).then(
			() => toast.success(`Lease ${status}`),
			(e) => fail(e, 'Update failed')
		);
	}

	async function submitFee(e: SubmitEvent) {
		e.preventDefault();
		if (!feeAmount) return;
		try {
			await addCharge({
				leaseId: id,
				kind: 'fee',
				description: feeDesc,
				dueDate: feeDate,
				amount: feeAmount
			});
			feeOpen = false;
			feeAmount = null;
			toast.success('Charge added');
		} catch (err) {
			fail(err, 'Could not add charge');
		}
	}

	async function removePayment(paymentId: string) {
		if (!confirm('Delete this payment?')) return;
		await deletePayment({ id: paymentId, leaseId: id }).catch((e) => fail(e, 'Could not delete'));
	}
</script>

<PageHeader {title} crumbs={[{ label: 'Leases', href: '/leases' }]}>
	{#snippet actions()}
		<Button
			size="sm"
			onclick={() => (payment = { leaseId: id, balance: Math.max(0, l.balance), label: title })}
			><Banknote /> <span class="hidden sm:inline">Record payment</span></Button
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
				{#if l.status === 'draft'}<DropdownMenu.Item onclick={() => setStatus('active')}
						>Activate lease</DropdownMenu.Item
					>{/if}
				{#if l.status === 'active'}
					{#if !l.renewedById}<DropdownMenu.Item onclick={() => (renewOpen = true)}
							>Renew lease…</DropdownMenu.Item
						>{/if}
					<DropdownMenu.Item onclick={() => (lateFeeOpen = true)}>Late fee…</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={() => setStatus('ended')}>End lease</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onclick={() => setStatus('terminated')}
						>Terminate early</DropdownMenu.Item
					>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</PageHeader>

<main class="space-y-6 p-4 md:p-6">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-xl font-semibold tracking-tight">
			<a href="/properties/{l.propertyId}" class="hover:underline">{title}</a>
		</h1>
		<StatusBadge status={l.status} />
		{#if l.renewedFromId}<a
				href="/leases/{l.renewedFromId}"
				class="text-xs text-muted-foreground hover:underline">Renewal of previous lease</a
			>{/if}
		{#if l.renewedById}<a
				href="/leases/{l.renewedById}"
				class="text-xs font-medium text-primary hover:underline">Renewed · view next lease →</a
			>{/if}
	</div>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card.Root size="sm"
			><Card.Header
				><Card.Description>Balance</Card.Description><Card.Title
					class="text-xl tabular-nums {l.balance > 0 ? 'text-red-600 dark:text-red-400' : ''}"
					>{formatMoney(l.balance, l.currency)}</Card.Title
				></Card.Header
			></Card.Root
		>
		<Card.Root size="sm"
			><Card.Header
				><Card.Description>Rent</Card.Description><Card.Title class="text-xl tabular-nums"
					>{formatMoney(l.rentAmount, l.currency)}<span
						class="text-sm font-normal text-muted-foreground"
					>
						/ mo, due on the {l.rentDueDay}{l.rentDueDay === 1
							? 'st'
							: l.rentDueDay === 2
								? 'nd'
								: l.rentDueDay === 3
									? 'rd'
									: 'th'}</span
					></Card.Title
				><button
					type="button"
					class="text-left text-xs text-muted-foreground hover:underline"
					onclick={() => (lateFeeOpen = true)}
					>{l.lateFeeAmount
						? `Late fee ${formatMoney(l.lateFeeAmount, l.currency)} after ${l.lateFeeGraceDays} day${l.lateFeeGraceDays === 1 ? '' : 's'}`
						: 'No late fee'}</button
				></Card.Header
			></Card.Root
		>
		<Card.Root size="sm"
			><Card.Header
				><Card.Description>Term</Card.Description><Card.Title class="text-base"
					>{formatDate(l.startDate)} – {l.endDate
						? formatDate(l.endDate)
						: 'Month-to-month'}</Card.Title
				></Card.Header
			></Card.Root
		>
		<Card.Root size="sm"
			><Card.Header
				><Card.Description>Deposit</Card.Description><Card.Title class="text-xl tabular-nums"
					>{formatMoney(l.depositAmount, l.currency)}</Card.Title
				></Card.Header
			></Card.Root
		>
	</div>

	<section class="space-y-2">
		<h2 class="text-sm font-medium">Tenants</h2>
		<div class="flex flex-wrap gap-2">
			{#each l.tenants as t (t.id)}
				<a href="/tenants/{t.id}" class="rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
					<span class="font-medium">{tenantName(t)}</span>{#if t.isPrimary}<span
							class="ml-1.5 text-xs text-muted-foreground">primary</span
						>{/if}
					{#if t.email}<span class="block text-xs text-muted-foreground">{t.email}</span>{/if}
				</a>
			{/each}
		</div>
	</section>

	<Tabs.Root bind:value={tab}>
		<div class="flex items-center gap-2">
			<Tabs.List>
				<Tabs.Trigger value="charges"
					>Charges <span class="ml-1 text-xs text-muted-foreground">{l.charges.length}</span
					></Tabs.Trigger
				>
				<Tabs.Trigger value="payments"
					>Payments <span class="ml-1 text-xs text-muted-foreground">{l.payments.length}</span
					></Tabs.Trigger
				>
			</Tabs.List>
			<Popover.Root bind:open={feeOpen}>
				<Popover.Trigger class="ml-auto">
					{#snippet child({ props })}<Button size="sm" variant="outline" {...props}
							><Plus /> Charge</Button
						>{/snippet}
				</Popover.Trigger>
				<Popover.Content align="end" class="w-72">
					<form class="space-y-3" onsubmit={submitFee}>
						<Field.Field
							><Field.Label for="fee-desc">Description</Field.Label><Input
								id="fee-desc"
								bind:value={feeDesc}
							/></Field.Field
						>
						<div class="grid grid-cols-2 gap-2">
							<Field.Field
								><Field.Label for="fee-amt">Amount</Field.Label><MoneyInput
									id="fee-amt"
									required
									bind:value={feeAmount}
								/></Field.Field
							>
							<Field.Field
								><Field.Label for="fee-date">Due</Field.Label><Input
									id="fee-date"
									type="date"
									bind:value={feeDate}
								/></Field.Field
							>
						</div>
						<Button type="submit" size="sm" class="w-full" disabled={!feeAmount}>Add charge</Button>
					</form>
				</Popover.Content>
			</Popover.Root>
		</div>
		<Tabs.Content value="charges" class="mt-2 overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header
					><Table.Row
						><Table.Head>Due</Table.Head><Table.Head>Description</Table.Head><Table.Head
							class="text-right">Amount</Table.Head
						><Table.Head class="text-right">Paid</Table.Head><Table.Head class="w-28"
						></Table.Head></Table.Row
					></Table.Header
				>
				<Table.Body>
					{#each l.charges as c (c.id)}
						{@const open = c.amount - c.paid}
						<Table.Row>
							<Table.Cell class="tabular-nums">{formatDate(c.dueDate, true)}</Table.Cell>
							<Table.Cell>{c.description ?? c.kind}</Table.Cell>
							<Table.Cell class="text-right tabular-nums"
								>{formatMoney(c.amount, l.currency)}</Table.Cell
							>
							<Table.Cell class="text-right text-muted-foreground tabular-nums"
								>{c.paid ? formatMoney(c.paid, l.currency) : '—'}</Table.Cell
							>
							<Table.Cell class="text-right">
								{#if open > 0}
									<Button
										size="sm"
										variant="ghost"
										onclick={() =>
											(payment = {
												leaseId: id,
												chargeId: c.id,
												balance: open,
												label: `${c.description ?? c.kind} · ${title}`
											})}>Record</Button
									>
								{:else}<StatusBadge status="paid" />{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={5} class="py-8 text-center text-muted-foreground"
								>No charges yet.</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</Tabs.Content>
		<Tabs.Content value="payments" class="mt-2 overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header
					><Table.Row
						><Table.Head>Received</Table.Head><Table.Head>Method</Table.Head><Table.Head
							>Reference</Table.Head
						><Table.Head class="text-right">Amount</Table.Head><Table.Head class="w-10"
						></Table.Head></Table.Row
					></Table.Header
				>
				<Table.Body>
					{#each l.payments as p (p.id)}
						<Table.Row>
							<Table.Cell class="tabular-nums">{formatDate(p.receivedOn, true)}</Table.Cell>
							<Table.Cell class="text-muted-foreground uppercase">{p.method}</Table.Cell>
							<Table.Cell class="text-muted-foreground">{p.reference ?? ''}</Table.Cell>
							<Table.Cell class="text-right font-medium tabular-nums"
								>{formatMoney(p.amount, l.currency)}</Table.Cell
							>
							<Table.Cell
								><Button
									size="icon-sm"
									variant="ghost"
									aria-label="Delete payment"
									onclick={() => removePayment(p.id)}><Ellipsis /></Button
								></Table.Cell
							>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={5} class="py-8 text-center text-muted-foreground"
								>No payments yet.</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</Tabs.Content>
	</Tabs.Root>
</main>

<PaymentDialog bind:target={payment} />
<LateFeeDialog bind:open={lateFeeOpen} lease={l} />
<RenewLeaseDialog bind:open={renewOpen} lease={l} />
