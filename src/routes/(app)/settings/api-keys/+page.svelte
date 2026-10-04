<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getApiKeys, createApiKey, deleteApiKey } from '#lib/remote/api-keys.remote.ts';
	import { formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Copy from '@lucide/svelte/icons/copy';
	import Trash from '@lucide/svelte/icons/trash-2';

	const keys = $derived(await getApiKeys());
	let name = $state('');
	let created = $state<string | null>(null);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		try {
			created = (await createApiKey({ name })).key;
			name = '';
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not create key'
			);
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>API keys</Card.Title>
		<Card.Description
			>Use with <code>Authorization: Bearer &lt;key&gt;</code> against <code>/api/v1</code>. See
			<a class="underline" href="/api/v1/openapi.json" target="_blank">the OpenAPI spec</a
			>.</Card.Description
		>
	</Card.Header>
	<Card.Content class="space-y-4">
		<form class="flex gap-2" onsubmit={create}>
			<Input placeholder="Key name, e.g. Zapier" required bind:value={name} />
			<Button type="submit">Create key</Button>
		</form>
		{#if created}
			<Alert.Root>
				<Alert.Title>Copy your key now. It won't be shown again.</Alert.Title>
				<Alert.Description>
					<div class="mt-2 flex w-full items-center gap-2 rounded-md bg-muted p-2">
						<code class="min-w-0 flex-1 truncate font-mono text-xs">{created}</code>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Copy key"
							onclick={() =>
								navigator.clipboard.writeText(created!).then(() => toast.success('Copied'))}
							><Copy /></Button
						>
					</div>
				</Alert.Description>
			</Alert.Root>
		{/if}
		{#if keys.length}
			<ul class="divide-y rounded-lg border">
				{#each keys as k (k.id)}
					<li class="flex items-center gap-3 p-3">
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium">{k.name ?? 'Unnamed key'}</p>
							<p class="text-xs text-muted-foreground">
								<code>{k.start ?? k.prefix}…</code> · created {formatRelative(
									k.createdAt
								)}{k.lastRequest ? ` · last used ${formatRelative(k.lastRequest)}` : ''}
							</p>
						</div>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Revoke"
							onclick={() => confirm('Revoke this key?') && deleteApiKey(k.id)}><Trash /></Button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</Card.Content>
</Card.Root>
