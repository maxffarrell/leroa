<script lang="ts">
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getPortal, submitRequest } from '#lib/remote/portal.remote.ts';
	import { formatDate, formatMoney, formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';

	const methodLabels: Record<string, string> = {
		ach: 'ACH / bank',
		card: 'Card',
		check: 'Check',
		cash: 'Cash',
		transfer: 'Wire / transfer',
		other: 'Other'
	};
	const p = $derived(await getPortal());
	let title = $state('');
	let description = $state('');
	let pending = $state(false);

	async function submit(e: SubmitEvent, leaseId: string) {
		e.preventDefault();
		pending = true;
		try {
			const t = await submitRequest({ leaseId, title, description: description || null });
			toast.success(`Request #${t.number} sent to your property manager`);
			title = description = '';
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not send request'
			);
		} finally {
			pending = false;
		}
	}
</script>

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
					<Button type="submit" disabled={pending || !title.trim()}
						>{pending ? 'Sending…' : 'Send request'}</Button
					>
				</form>
			</Card.Footer>
		</Card.Root>
	{/each}
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
