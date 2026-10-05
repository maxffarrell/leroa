<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import {
		connectProvider,
		disconnectProvider,
		getPaymentSettings,
		setProviderEnabled
	} from '#lib/remote/payments.remote.ts';
	import { toast } from 'svelte-sonner';
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	const s = $derived(await getPaymentSettings());
	const canEdit = $derived(page.data.role !== 'member' && !page.data.demo);
	let busy = $state<string | null>(null);

	async function run(id: string, fn: () => Promise<void>, fallback: string) {
		busy = id;
		try {
			await fn();
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);
		} finally {
			busy = null;
		}
	}

	const connect = (id: string, name: string) =>
		run(
			id,
			async () => {
				const { url } = await connectProvider(id);
				location.assign(url);
			},
			`Could not start ${name} onboarding`
		);

	const disconnect = (id: string, name: string) =>
		run(
			id,
			async () => {
				if (
					!confirm(
						`Disconnect this ${name} account? Tenants will no longer be able to pay with it.`
					)
				)
					return;
				await disconnectProvider(id);
				toast.success(`${name} disconnected`);
			},
			'Could not disconnect'
		);

	const toggle = (id: string, name: string, enabled: boolean) =>
		run(
			id,
			async () => {
				await setProviderEnabled({ provider: id, enabled });
				toast.success(enabled ? `Tenants can now pay with ${name}` : `${name} turned off`);
			},
			'Could not save'
		);

	async function copy(url: string) {
		await navigator.clipboard.writeText(url);
		toast.success('Webhook URL copied');
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Online rent payments</Card.Title>
		<Card.Description>
			Let tenants pay their balance from the portal. Money goes straight to the payment provider,
			never through Leroa. Each payment is recorded automatically and applied to the oldest unpaid
			charges first.
		</Card.Description>
	</Card.Header>
</Card.Root>

{#each s.providers as p (p.id)}
	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<Card.Title>{p.name}</Card.Title>
				{#if !p.configured}
					<Badge variant="outline">Not set up</Badge>
				{:else if p.enabled && p.ready}
					<Badge variant="secondary">On</Badge>
				{:else if !p.ready}
					<Badge variant="outline">Needs setup</Badge>
				{/if}
			</div>
			<Card.Description>{p.description}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-5">
			{#if !p.configured}
				<p class="text-sm text-muted-foreground">
					Set
					{#each p.env as name, i (name)}<code class="font-mono text-xs">{name}</code>{i <
						p.env.length - 2
							? ', '
							: i === p.env.length - 2
								? ' and '
								: ''}{/each}
					on the server to turn this on.
				</p>
			{:else}
				<div class="flex items-start justify-between gap-4">
					<div class="space-y-0.5">
						<Label for="pay-{p.id}">Offer {p.name} in the portal</Label>
						<p class="text-sm text-muted-foreground">
							{p.ready
								? 'Tenants see a pay button whenever they have a balance.'
								: (p.hint ?? 'Finish setup first.')}
						</p>
					</div>
					<Switch
						id="pay-{p.id}"
						checked={p.enabled}
						disabled={!canEdit || busy !== null || (!p.ready && !p.enabled)}
						onCheckedChange={(v) => toggle(p.id, p.name, v)}
					/>
				</div>

				{#if p.connectable}
					<div class="space-y-2">
						<p class="text-sm font-medium">Account</p>
						<p class="text-sm text-muted-foreground">
							{#if p.account}
								Payments go to your connected {p.name} account.
							{:else if s.requiresConnect}
								Connect your {p.name} account to receive payments.
							{:else}
								Payments go to this server's {p.name} account. Connect a different account if this workspace
								should be paid separately.
							{/if}
						</p>
						<div class="flex flex-wrap items-center gap-3">
							{#if p.account}
								<code class="rounded bg-muted px-2 py-1 font-mono text-sm">{p.account.id}</code>
								{#if p.account.ready}
									<Badge variant="secondary">Ready</Badge>
								{:else}
									<Badge variant="outline">Setup incomplete</Badge>
								{/if}
							{/if}
							{#if canEdit}
								<div class="flex flex-wrap gap-2 sm:ml-auto">
									{#if !p.account || !p.account.ready}
										<Button size="sm" disabled={busy !== null} onclick={() => connect(p.id, p.name)}
											><ExternalLink />
											{p.account ? `Finish setup on ${p.name}` : `Connect ${p.name}`}</Button
										>
									{/if}
									{#if p.account}
										<Button
											size="sm"
											variant="outline"
											disabled={busy !== null}
											onclick={() => disconnect(p.id, p.name)}>Disconnect</Button
										>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<div class="space-y-2">
					<p class="text-sm font-medium">Webhook</p>
					<p class="text-sm text-muted-foreground">
						Events:
						{#each p.webhookEvents as e, i (e)}<code class="font-mono text-xs">{e}</code>{i <
							p.webhookEvents.length - 1
								? ', '
								: ''}{/each}.
						{p.webhookNote ?? ''}
					</p>
					<div class="flex items-center gap-2">
						<code class="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-sm"
							>{p.webhookUrl}</code
						>
						<Button
							size="icon"
							variant="outline"
							aria-label="Copy {p.name} webhook URL"
							onclick={() => copy(p.webhookUrl)}><Copy /></Button
						>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
{/each}
