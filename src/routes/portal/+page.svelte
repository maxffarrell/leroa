<script lang="ts">
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import PortalAgreements from '#lib/components/app/portal-agreements.svelte';
	import PortalProvisions from '#lib/components/app/portal-provisions.svelte';
	import PortalInspections from '#lib/components/app/portal-inspections.svelte';
	import PortalMessages from '#lib/components/app/portal-messages.svelte';
	import PortalAnnouncements from '#lib/components/app/portal-announcements.svelte';
	import PortalSurveys from '#lib/components/app/portal-surveys.svelte';
	import PortalProfile from '#lib/components/app/portal-profile.svelte';
	import SocialAccounts from '#lib/components/app/social-accounts.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getPortal, payOnline, submitRequest } from '#lib/remote/portal.remote.ts';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import { formatDate, formatMoney, formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';

	const methodLabels: Record<string, string> = {
		ach: 'ACH / bank',
		card: 'Card',
		check: 'Check',
		cash: 'Cash',
		transfer: 'Wire / transfer',
		bilt: 'Bilt',
		paypal: 'PayPal',
		direct_debit: 'Direct debit',
		other: 'Other'
	};
	const p = $derived(await getPortal());
	let title = $state('');
	let description = $state('');
	let pending = $state(false);
	let paying = $state<string | null>(null);

	onMount(() => {
		if (page.url.searchParams.get('paid') === '1') {
			toast.success(
				'Thanks! Your payment was received. Bank payments can take a few days to clear.'
			);
			void goto('/portal', { state: page.state, shallow: true, replace: true });
		}
	});

	async function pay(leaseId: string, provider: string, newTab: boolean) {
		paying = `${leaseId}:${provider}`;
		// Open the tab synchronously so popup blockers allow it.
		const tab = newTab ? window.open('about:blank', '_blank') : null;
		try {
			const { url } = await payOnline({ leaseId, provider });
			if (tab) {
				tab.location.href = url;
				paying = null;
				toast.info('Finish paying in the new tab. Your balance updates once the payment clears.');
			} else {
				location.assign(url);
			}
		} catch (err) {
			tab?.close();
			paying = null;
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not start payment'
			);
		}
	}

	let photos = $state<FileList | undefined>();

	async function submit(e: SubmitEvent, leaseId: string) {
		e.preventDefault();
		pending = true;
		try {
			const form = e.currentTarget as HTMLFormElement;
			const t = await submitRequest({ leaseId, title, description: description || null });
			if (photos?.length) {
				const body = new FormData();
				for (const f of photos) body.append('file', f);
				const res = await fetch(`/api/portal/requests/${t.id}/photos`, { method: 'POST', body });
				if (!res.ok)
					toast.error(
						(await res.json().catch(() => null))?.message ??
							'Request sent, but the photos did not upload'
					);
			}
			toast.success(`Request #${t.number} sent to your property manager`);
			title = description = '';
			photos = undefined;
			form.reset();
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not send request'
			);
		} finally {
			pending = false;
		}
	}
</script>

<svelte:window onfocus={() => void getPortal().refresh()} />

<svelte:head><title>Resident portal</title></svelte:head>

{#if !p}
	<Card.Root>
		<Card.Header>
			<Card.Title>No home linked yet</Card.Title>
			<Card.Description
				>Ask your property manager for a portal invite link, then open it while signed in.</Card.Description
			>
		</Card.Header>
	</Card.Root>
{:else}
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Hi {p.name}</h1>
		<p class="text-sm text-muted-foreground">Managed by {p.orgName}</p>
	</div>
	<PortalAnnouncements />
	{#if p.surveys.length}
		<PortalSurveys surveys={p.surveys} />
	{/if}
	{#each p.leases as l (l.id)}
		<Card.Root>
			<Card.Header>
				<Card.Description>{l.address}</Card.Description>
				<Card.Title>{l.propertyName} · {l.unitName}</Card.Title>
			</Card.Header>
			<Card.Content class="grid gap-4 sm:grid-cols-3">
				<div>
					<p class="text-xs text-muted-foreground">Balance due</p>
					<p
						class="text-2xl font-semibold tabular-nums {l.balance > 0
							? 'text-red-600 dark:text-red-400'
							: ''}"
					>
						{formatMoney(Math.max(0, l.balance), l.currency)}
					</p>
					{#if l.payWith.length && l.balance > 0}
						<div class="mt-2 flex flex-wrap gap-2">
							{#each l.payWith as option, i (option.id)}
								<Button
									size="sm"
									variant={i === 0 ? 'default' : 'outline'}
									disabled={paying !== null}
									onclick={() => pay(l.id, option.id, option.newTab)}
									><CreditCard />
									{paying === `${l.id}:${option.id}`
										? 'Opening…'
										: l.payWith.length === 1
											? 'Pay now'
											: option.label}</Button
								>
							{/each}
						</div>
					{/if}
				</div>
				<div>
					<p class="text-xs text-muted-foreground">Monthly rent</p>
					<p class="text-lg font-medium tabular-nums">{formatMoney(l.rentAmount, l.currency)}</p>
					<p class="text-xs text-muted-foreground">due on day {l.rentDueDay}</p>
				</div>
				<div>
					<p class="text-xs text-muted-foreground">Lease</p>
					<p class="text-sm">
						{formatDate(l.startDate)} – {l.endDate ? formatDate(l.endDate) : 'month-to-month'}
					</p>
				</div>
			</Card.Content>
			{#if l.provisions?.clauses.length || l.provisions?.dates.length}
				<Card.Content>
					<PortalProvisions provisions={l.provisions} />
				</Card.Content>
			{/if}
			{#if l.agreements.length}
				<Card.Content class="space-y-4">
					<PortalAgreements agreements={l.agreements} />
				</Card.Content>
			{/if}
			{#if l.inspections.length}
				<Card.Content class="space-y-4">
					<PortalInspections inspections={l.inspections} />
				</Card.Content>
			{/if}
			<Card.Content>
				<h2 class="mb-2 text-sm font-medium">Recent charges</h2>
				<ul class="divide-y rounded-lg border text-sm">
					{#each l.charges as c (c.id)}
						<li class="flex items-center gap-3 px-3 py-2">
							<span class="w-16 text-muted-foreground tabular-nums"
								>{formatDate(c.dueDate, true)}</span
							>
							<span class="flex-1">{c.description ?? c.kind}</span>
							<span class="tabular-nums">{formatMoney(c.amount, l.currency)}</span>
							<StatusBadge status={c.paid >= c.amount ? 'paid' : c.paid > 0 ? 'partial' : 'due'} />
						</li>
					{:else}
						<li class="px-3 py-4 text-center text-muted-foreground">No charges yet.</li>
					{/each}
				</ul>
			</Card.Content>
			<Card.Content>
				<h2 class="mb-2 text-sm font-medium">Payment history</h2>
				<ul class="divide-y rounded-lg border text-sm">
					{#each l.payments as pay (pay.id)}
						<li class="flex items-center gap-3 px-3 py-2">
							<span class="w-16 text-muted-foreground tabular-nums"
								>{formatDate(pay.receivedOn, true)}</span
							>
							<span class="min-w-0 flex-1 truncate"
								>{methodLabels[pay.method] ?? pay.method}{#if pay.reference}<span
										class="text-muted-foreground"
									>
										· {pay.reference}</span
									>{/if}</span
							>
							<span class="tabular-nums">{formatMoney(pay.amount, l.currency)}</span>
						</li>
					{:else}
						<li class="px-3 py-4 text-center text-muted-foreground">No payments yet.</li>
					{/each}
				</ul>
			</Card.Content>
			<Card.Footer class="block border-t pt-6">
				<form class="space-y-3" onsubmit={(e) => submit(e, l.id)}>
					<h2 class="text-sm font-medium">Request maintenance</h2>
					<Field.Field
						><Field.Label for="req-title-{l.id}">What's wrong?</Field.Label><Input
							id="req-title-{l.id}"
							placeholder="Dishwasher won't drain"
							required
							bind:value={title}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="req-desc-{l.id}">Details (optional)</Field.Label><Textarea
							id="req-desc-{l.id}"
							rows={3}
							bind:value={description}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="req-photos-{l.id}">Photos (optional)</Field.Label><Input
							id="req-photos-{l.id}"
							type="file"
							accept="image/*"
							multiple
							bind:files={photos}
						/><Field.Description
							>Up to 10. A photo helps us send the right person.</Field.Description
						></Field.Field
					>
					<Button type="submit" disabled={pending || !title.trim()}
						>{pending ? 'Sending…' : 'Send request'}</Button
					>
				</form>
			</Card.Footer>
		</Card.Root>
	{/each}
	<PortalMessages />
	<PortalProfile />
	<SocialAccounts />
	{#if p.tickets.length}
		<Card.Root>
			<Card.Header><Card.Title>Your requests</Card.Title></Card.Header>
			<Card.Content class="px-0">
				<ul class="divide-y">
					{#each p.tickets as t (t.id)}
						<li class="flex items-center gap-3 px-6 py-2.5 text-sm">
							<StatusBadge status={t.status} /><span class="flex-1">#{t.number} {t.title}</span
							><span class="text-xs text-muted-foreground">{formatRelative(t.createdAt)}</span>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
{/if}
