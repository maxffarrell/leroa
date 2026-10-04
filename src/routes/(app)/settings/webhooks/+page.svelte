<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import {
		getWebhooks,
		createWebhook,
		toggleWebhook,
		deleteWebhook
	} from '#lib/remote/workspace.remote.ts';
	import { formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash from '@lucide/svelte/icons/trash-2';

	const hooks = $derived(await getWebhooks());
	let url = $state('');

	async function add(e: SubmitEvent) {
		e.preventDefault();
		try {
			await createWebhook({ url });
			url = '';
			toast.success('Webhook added');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Invalid URL');
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Webhooks</Card.Title>
		<Card.Description>
			Keystone POSTs every event as JSON. Verify the <code>x-keystone-signature</code> header:
			<code>sha256=HMAC(secret, body)</code>.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<form class="flex gap-2" onsubmit={add}>
			<Input
				type="url"
				placeholder="https://example.com/keystone-webhook"
				required
				bind:value={url}
			/>
			<Button type="submit">Add</Button>
		</form>
		{#if hooks.length}
			<ul class="divide-y rounded-lg border">
				{#each hooks as h (h.id)}
					<li class="space-y-2 p-3">
						<div class="flex items-center gap-3">
							<Switch
								checked={h.enabled}
								onCheckedChange={(enabled) => toggleWebhook({ id: h.id, enabled })}
								aria-label="Enabled"
							/>
							<code class="min-w-0 flex-1 truncate text-sm">{h.url}</code>
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label="Delete"
								onclick={() => confirm('Delete webhook?') && deleteWebhook(h.id)}><Trash /></Button
							>
						</div>
						<div
							class="flex flex-wrap items-center gap-x-4 gap-y-1 pl-12 text-xs text-muted-foreground"
						>
							<button
								class="flex items-center gap-1 hover:text-foreground"
								onclick={() =>
									navigator.clipboard
										.writeText(h.secret)
										.then(() => toast.success('Secret copied'))}
								><Copy class="size-3" /> Copy signing secret</button
							>
							<span>Events: {h.events.join(', ')}</span>
							{#if h.lastDeliveryAt}<span
									class={h.lastDeliveryStatus && h.lastDeliveryStatus < 300 ? '' : 'text-red-600'}
									>Last delivery {formatRelative(h.lastDeliveryAt)} · {h.lastDeliveryStatus ??
										'failed'}</span
								>{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
