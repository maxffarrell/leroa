<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import {
		approveApplication,
		getApplication,
		updateApplication
	} from '#lib/remote/listings.remote.ts';
	import { formatDate, formatMoney, formatRelative, todayISO } from '#lib/format.ts';
	import { leaseEndFor } from '#lib/listings.ts';
	import { toast } from 'svelte-sonner';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Check from '@lucide/svelte/icons/check';

	const id = $derived(page.params.id!);
	const a = $derived(await getApplication(id));
	const name = $derived(`${a.firstName} ${a.lastName}`);
	const decided = $derived(a.status === 'approved' || a.status === 'declined');
	const ratio = $derived(a.monthlyIncome && a.listingRent ? a.monthlyIncome / a.listingRent : null);

	let notes = $state<string | null>(null);
	const notesValue = $derived(notes ?? a.notes ?? '');

	let approving = $state(false);
	let startDate = $state('');
	let endDate = $state('');
	let rentAmount = $state<number | null>(null);
	let depositAmount = $state<number | null>(null);
	let pending = $state(false);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	async function setStatus(status: 'new' | 'reviewing' | 'declined' | 'withdrawn') {
		if (status === 'declined' && !confirm(`Decline ${name}'s application?`)) return;
		try {
			await updateApplication({ id, status });
			toast.success(status === 'declined' ? 'Application declined' : `Marked ${status}`);
		} catch (err) {
			fail(err, 'Could not update');
		}
	}

	async function saveNotes() {
		if (notes === null || notes === (a.notes ?? '')) return;
		try {
			await updateApplication({ id, notes: notes || null });
			notes = null;
			toast.success('Notes saved');
		} catch (err) {
			fail(err, 'Could not save notes');
		}
	}

	function openApprove() {
		const today = todayISO();
		const preferred = [a.moveInDate, a.listingAvailableOn].find((d) => d && d >= today) ?? today;
		startDate = preferred;
		endDate = leaseEndFor(preferred, a.listingTerm ?? 12);
		rentAmount = a.listingRent ?? null;
		depositAmount = a.listingDeposit ?? null;
		approving = true;
	}

	async function approve(e: SubmitEvent) {
		e.preventDefault();
		if (!rentAmount) return toast.error('Enter the rent');
		pending = true;
		try {
			const r = await approveApplication({
				id,
				startDate,
				endDate: endDate || null,
				rentAmount,
				depositAmount: depositAmount ?? 0
			});
			approving = false;
			toast.success('Approved. A draft lease is ready.');
			await goto(`/leases/${r.leaseId}`);
		} catch (err) {
			fail(err, 'Could not approve');
		} finally {
			pending = false;
		}
	}
</script>

<PageHeader title={name} crumbs={[{ label: 'Leasing', href: '/leasing' }]}>
	{#snippet actions()}
		{#if a.status === 'approved'}
			{#if a.leaseId}<Button size="sm" href="/leases/{a.leaseId}">Open lease</Button>{/if}
		{:else if a.status !== 'withdrawn'}
			{#if a.status !== 'declined'}
				<Button size="sm" variant="outline" onclick={() => setStatus('declined')}>Decline</Button>
			{/if}
			<Button size="sm" onclick={openApprove} disabled={!a.unitId}><Check /> Approve</Button>
		{/if}
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
				<DropdownMenu.Item onclick={() => (location.href = `mailto:${a.email}`)}
					><Mail /> Email applicant</DropdownMenu.Item
				>
				{#if a.status !== 'approved'}
					<DropdownMenu.Separator />
					{#if a.status !== 'reviewing'}
						<DropdownMenu.Item onclick={() => setStatus('reviewing')}
							>Mark reviewing</DropdownMenu.Item
						>
					{/if}
					{#if a.status !== 'new'}
						<DropdownMenu.Item onclick={() => setStatus('new')}>Mark new</DropdownMenu.Item>
					{/if}
					{#if a.status !== 'withdrawn'}
						<DropdownMenu.Item onclick={() => setStatus('withdrawn')}
							>Applicant withdrew</DropdownMenu.Item
						>
					{/if}
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</PageHeader>

<main class="grid gap-6 p-4 md:p-6 lg:grid-cols-[1fr_20rem]">
	<div class="min-w-0 space-y-6">
		<div class="space-y-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-xl font-semibold tracking-tight">{name}</h1>
				<StatusBadge status={a.status} />
			</div>
			<p class="text-sm text-muted-foreground">
				Applied {formatRelative(a.createdAt)} for
				{#if a.listingId}<a
						class="underline-offset-2 hover:underline"
						href="/leasing/listings/{a.listingId}">{a.listingTitle}</a
					>{:else}a listing that was deleted{/if}
				{#if a.propertyName}· {a.propertyName} · {a.unitName}{/if}
			</p>
		</div>

		{#if a.status === 'approved'}
			<Alert.Root>
				<Alert.Title>Approved {a.decidedAt ? formatRelative(a.decidedAt) : ''}</Alert.Title>
				<Alert.Description>
					A tenant record and a draft lease were created. Send a lease agreement from the lease,
					then mark it active when it's signed.
					<span class="mt-2 flex gap-2">
						{#if a.leaseId}<Button size="sm" variant="outline" href="/leases/{a.leaseId}"
								>Lease</Button
							>{/if}
						{#if a.tenantId}<Button size="sm" variant="outline" href="/tenants/{a.tenantId}"
								>Tenant</Button
							>{/if}
					</span>
				</Alert.Description>
			</Alert.Root>
		{:else if a.openSiblings > 0 && !decided}
			<p class="text-sm text-muted-foreground">
				{a.openSiblings} other open {a.openSiblings === 1 ? 'application' : 'applications'} for this home.
			</p>
		{/if}

		<div class="grid gap-4 sm:grid-cols-2">
			<Card.Root size="sm">
				<Card.Header><Card.Title>Contact</Card.Title></Card.Header>
				<Card.Content class="space-y-2 text-sm">
					<a href="mailto:{a.email}" class="flex items-center gap-2 break-all hover:underline"
						><Mail class="size-4 shrink-0 text-muted-foreground" />{a.email}</a
					>
					{#if a.phone}<a href="tel:{a.phone}" class="flex items-center gap-2 hover:underline"
							><Phone class="size-4 shrink-0 text-muted-foreground" />{a.phone}</a
						>{/if}
					{#if a.currentAddress}<p class="text-muted-foreground">
							Lives at {a.currentAddress}
						</p>{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root size="sm">
				<Card.Header><Card.Title>Income</Card.Title></Card.Header>
				<Card.Content class="space-y-1 text-sm">
					<p class="text-lg font-semibold tabular-nums">
						{formatMoney(a.monthlyIncome)}<span class="text-sm font-normal text-muted-foreground"
							>/mo</span
						>
					</p>
					{#if ratio}<p class="text-muted-foreground">
							{ratio.toFixed(1)}× the listed rent of {formatMoney(a.listingRent)}
						</p>{/if}
					{#if a.employer}<p>{a.employer}</p>{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root size="sm">
				<Card.Header><Card.Title>Move-in</Card.Title></Card.Header>
				<Card.Content class="space-y-1 text-sm">
					<p>{a.moveInDate ? formatDate(a.moveInDate) : 'Flexible'}</p>
					<p class="text-muted-foreground">
						{a.occupants}
						{a.occupants === 1 ? 'person' : 'people'}{a.pets ? ` · Pets: ${a.pets}` : ''}
					</p>
				</Card.Content>
			</Card.Root>

			{#if a.message}
				<Card.Root size="sm">
					<Card.Header><Card.Title>Message</Card.Title></Card.Header>
					<Card.Content class="text-sm whitespace-pre-line">{a.message}</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>

	<aside class="space-y-4">
		<Card.Root size="sm">
			<Card.Header>
				<Card.Title>Internal notes</Card.Title>
				<Card.Description>Only your team sees these.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Textarea
					rows={5}
					aria-label="Internal notes"
					value={notesValue}
					oninput={(e) => (notes = e.currentTarget.value)}
					onblur={saveNotes}
				/>
			</Card.Content>
		</Card.Root>
		<p class="text-xs leading-relaxed text-muted-foreground">
			Use the same written criteria for every applicant, and decide in the order applications
			arrived. Leroa doesn't run credit or background checks; use a screening provider for those.
		</p>
	</aside>
</main>

<Dialog.Root bind:open={approving}>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={approve} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>Approve {a.firstName}</Dialog.Title>
				<Dialog.Description
					>Creates a tenant and a draft lease, and closes the listing. Nothing is charged until you
					activate the lease.</Dialog.Description
				>
			</Dialog.Header>
			<Field.Group class="gap-4">
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="ap-start">Start</Field.Label>
						<Input
							id="ap-start"
							type="date"
							required
							bind:value={startDate}
							onchange={() => (endDate = leaseEndFor(startDate, a.listingTerm ?? 12))}
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="ap-end">End</Field.Label>
						<Input id="ap-end" type="date" min={startDate} bind:value={endDate} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="ap-rent">Rent / month</Field.Label>
						<MoneyInput id="ap-rent" required bind:value={rentAmount} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="ap-deposit">Deposit</Field.Label>
						<MoneyInput id="ap-deposit" bind:value={depositAmount} />
					</Field.Field>
				</div>
			</Field.Group>
			<Dialog.Footer>
				<Button type="submit" disabled={pending}>{pending ? 'Approving…' : 'Approve'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
