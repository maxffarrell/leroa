<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import {
		connectStripe,
		disconnectStripe,
		getPaymentSettings,
		setOnlinePayments
	} from '#lib/remote/payments.remote.ts';
	import { toast } from 'svelte-sonner';
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	const s = $derived(await getPaymentSettings());
	const canEdit = $derived(page.data.role !== 'member' && !page.data.demo);
	let busy = $state(false);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	async function run(fn: () => Promise<void>, fallback: string) {
		busy = true;
		try {
			await fn();
		} catch (err) {
			fail(err, fallback);
		} finally {
			busy = false;
		}
	}

	const connect = () =>
		run(async () => {
			const { url } = await connectStripe();
			location.assign(url);
		}, 'Could not start Stripe onboarding');

	const disconnect = () =>
		run(async () => {
			if (!confirm('Disconnect this Stripe account? Tenants will no longer be able to pay online.'))
				return;
			await disconnectStripe();
			toast.success('Stripe disconnected');
		}, 'Could not disconnect');

	const toggle = (enabled: boolean) =>
		run(async () => {
			await setOnlinePayments(enabled);
			toast.success(enabled ? 'Tenants can now pay online' : 'Online payments turned off');
		}, 'Could not save');

	async function copyWebhook() {
		await navigator.clipboard.writeText(s.webhookUrl);
		toast.success('Webhook URL copied');
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Online rent payments</Card.Title>
		<Card.Description>
			Tenants pay their balance by card or bank transfer from the portal, through Stripe Checkout.
			Money goes straight to your Stripe account, and each payment is recorded in Leroa
			automatically.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		{#if !s.configured}
			<p class="text-sm text-muted-foreground">
				Stripe isn't set up on this server. Set <code class="font-mono text-xs"
					>STRIPE_SECRET_KEY</code
				>
				and <code class="font-mono text-xs">STRIPE_WEBHOOK_SECRET</code> to turn this on.
			</p>
		{:else}
			<div class="flex items-start justify-between gap-4">
				<div class="space-y-0.5">
					<Label for="pay-online">Let tenants pay in the portal</Label>
					<p class="text-sm text-muted-foreground">
						{s.ready
							? 'A "Pay now" button appears whenever a tenant has a balance.'
							: 'Connect a Stripe account below first.'}
					</p>
				</div>
				<Switch
					id="pay-online"
					checked={s.enabled}
					disabled={!canEdit || busy || (!s.ready && !s.enabled)}
					onCheckedChange={toggle}
				/>
			</div>
		{/if}
	</Card.Content>
</Card.Root>

{#if s.configured}
	<Card.Root>
		<Card.Header>
			<Card.Title>Stripe account</Card.Title>
			<Card.Description>
				{#if s.account}
					Payments go to your connected Stripe account.
				{:else if s.requiresConnect}
					Connect your Stripe account to receive payments.
				{:else}
					Payments go to this server's Stripe account. Connect a different account if this workspace
					should be paid separately.
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-wrap items-center gap-3">
			{#if s.account}
				<code class="rounded bg-muted px-2 py-1 font-mono text-sm">{s.account.id}</code>
				{#if s.account.chargesEnabled}
					<Badge variant="secondary">Ready</Badge>
				{:else}
					<Badge variant="outline">Setup incomplete</Badge>
				{/if}
			{/if}
			{#if canEdit}
				<div class="flex flex-wrap gap-2 sm:ml-auto">
					{#if !s.account || !s.account.chargesEnabled}
						<Button size="sm" disabled={busy} onclick={connect}
							><ExternalLink />
							{s.account ? 'Finish setup on Stripe' : 'Connect Stripe'}</Button
						>
					{/if}
					{#if s.account}
						<Button size="sm" variant="outline" disabled={busy} onclick={disconnect}
							>Disconnect</Button
						>
					{/if}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Webhook</Card.Title>
			<Card.Description>
				Add this endpoint in Stripe for <code class="font-mono text-xs"
					>checkout.session.completed</code
				>,
				<code class="font-mono text-xs">checkout.session.async_payment_succeeded</code>
				and <code class="font-mono text-xs">account.updated</code>. For connected accounts, add it
				again with "Listen to events on Connected accounts".
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex items-center gap-2">
			<code class="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-sm"
				>{s.webhookUrl}</code
			>
			<Button size="icon" variant="outline" aria-label="Copy webhook URL" onclick={copyWebhook}
				><Copy /></Button
			>
		</Card.Content>
	</Card.Root>
{/if}
