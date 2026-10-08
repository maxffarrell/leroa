<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import ApiPermissionsEditor from '#lib/components/app/api-permissions-editor.svelte';
	import {
		getApiKeys,
		createApiKey,
		updateApiKeyPermissions,
		deleteApiKey
	} from '#lib/remote/api-keys.remote.ts';
	import {
		API_RESOURCES,
		API_RESOURCE_LABELS,
		describePermissions,
		everything,
		levelOf,
		normalizePermissions,
		type ApiPermissions
	} from '#lib/api-permissions.ts';
	import { formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import { CopyButton } from '#lib/components/ui/copy-button/index.js';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { rotateApiKey } from '#lib/remote/api-keys.remote.ts';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';

	type Key = Awaited<ReturnType<typeof getApiKeys>>[number];

	const keys = $derived(await getApiKeys());
	let editing = $state<{ id: string | null; title: string } | null>(null);
	let name = $state('');
	let permissions = $state<ApiPermissions>({});
	let expiresInDays = $state<number | null>(null);
	let pending = $state(false);
	let created = $state<string | null>(null);

	const presetLabels = { full: 'Full access', read: 'Read-only', none: 'No access' } as const;

	function openCreate() {
		name = '';
		expiresInDays = null;
		permissions = everything('read');
		editing = { id: null, title: 'New API key' };
	}

	function openEdit(k: Key) {
		permissions = normalizePermissions(k.permissions);
		editing = { id: k.id, title: `Permissions for ${k.name ?? 'unnamed key'}` };
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		if (!Object.keys(permissions).length) {
			toast.error('Grant at least one permission');
			return;
		}
		pending = true;
		try {
			if (editing.id) {
				await updateApiKeyPermissions({ keyId: editing.id, permissions });
				toast.success('Permissions updated');
			} else {
				created = (await createApiKey({ name, permissions, expiresInDays })).key;
			}
			editing = null;
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save key');
		} finally {
			pending = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>API keys</Card.Title>
		<Card.Description
			>Use with <code>Authorization: Bearer &lt;key&gt;</code> against <code>/api/v1</code>. Each
			key only reaches the resources you grant it. See
			<a class="underline" href="/api/v1/openapi.json" target="_blank">the OpenAPI spec</a
			>.</Card.Description
		>
		<Card.Action><Button size="sm" onclick={openCreate}><Plus /> New key</Button></Card.Action>
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if created}
			<Alert.Root>
				<Alert.Title>Copy your key now. It won't be shown again.</Alert.Title>
				<Alert.Description>
					<div class="mt-2 flex w-full items-center gap-2 rounded-md bg-muted p-2">
						<code class="min-w-0 flex-1 truncate font-mono text-xs">{created}</code>
						<CopyButton size="icon-sm" variant="ghost" aria-label="Copy key" text={created} />
					</div>
				</Alert.Description>
			</Alert.Root>
		{/if}
		{#if keys.length}
			<ul class="divide-y rounded-lg border">
				{#each keys as k (k.id)}
					{@const summary = describePermissions(k.permissions)}
					<li class="flex items-start gap-3 p-3">
						<div class="min-w-0 flex-1 space-y-1.5">
							<p class="text-sm font-medium">{k.name ?? 'Unnamed key'}</p>
							<p class="text-xs text-muted-foreground">
								<code>{k.start ?? k.prefix}…</code> · created {formatRelative(
									k.createdAt
								)}{k.lastRequest ? ` · last used ${formatRelative(k.lastRequest)}` : ''}{k.expiresAt
									? ` · expires ${formatRelative(k.expiresAt)}`
									: ''}
							</p>
							<div class="flex flex-wrap gap-1">
								{#if summary === 'custom'}
									{#each API_RESOURCES.filter((r) => levelOf(k.permissions, r) !== 'none') as r (r)}
										<Badge variant="outline"
											>{API_RESOURCE_LABELS[r]} · {levelOf(k.permissions, r) === 'write'
												? 'read & write'
												: 'read'}</Badge
										>
									{/each}
								{:else}
									<Badge variant={summary === 'none' ? 'destructive' : 'secondary'}
										>{presetLabels[summary]}</Badge
									>
								{/if}
							</div>
						</div>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Rotate key"
							onclick={async () => {
								created = (await rotateApiKey(k.id)).key;
								toast.success('Key rotated — copy the new key above');
							}}><RefreshCw /></Button
						>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Edit permissions"
							onclick={() => openEdit(k)}><Pencil /></Button
						>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Revoke"
							onclick={() =>
								confirmDelete({
									title: `Revoke ${k.name ?? 'this key'}?`,
									description:
										'Anything calling the API with this key starts getting 401s immediately.',
									onConfirm: () => deleteApiKey(k.id)
								})}><Trash /></Button
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">No API keys yet.</p>
		{/if}
	</Card.Content>
</Card.Root>

<Modal.Root bind:open={() => !!editing, (v) => !v && (editing = null)}>
	<Modal.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<form onsubmit={save} class="space-y-5">
			<Modal.Header>
				<Modal.Title>{editing?.title}</Modal.Title>
				<Modal.Description>Requests outside these permissions return 403.</Modal.Description>
			</Modal.Header>
			{#if !editing?.id}
				<Field.Field>
					<Field.Label for="key-name">Name</Field.Label>
					<Input id="key-name" placeholder="e.g. Zapier" required bind:value={name} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="key-expiry">Expires</Field.Label>
					<NativeSelect.Root
						id="key-expiry"
						value={expiresInDays === null ? '' : String(expiresInDays)}
						onchange={(e) =>
							(expiresInDays = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
					>
						<NativeSelect.Option value="">Never</NativeSelect.Option>
						<NativeSelect.Option value="30">30 days</NativeSelect.Option>
						<NativeSelect.Option value="90">90 days</NativeSelect.Option>
						<NativeSelect.Option value="365">1 year</NativeSelect.Option>
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			<ApiPermissionsEditor bind:value={permissions} />
			<Modal.Footer>
				<Button type="submit" disabled={pending}>{editing?.id ? 'Save' : 'Create key'}</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
