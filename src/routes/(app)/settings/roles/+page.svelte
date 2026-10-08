<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import ApiPermissionsEditor from '#lib/components/app/api-permissions-editor.svelte';
	import { getRoles, saveRole, deleteRole } from '#lib/remote/roles.remote.ts';
	import {
		API_RESOURCES,
		API_RESOURCE_LABELS,
		describePermissions,
		everything,
		levelOf,
		normalizePermissions,
		type ApiPermissions
	} from '#lib/api-permissions.ts';
	import { toast } from 'svelte-sonner';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash from '@lucide/svelte/icons/trash-2';

	type Role = Awaited<ReturnType<typeof getRoles>>[number];
	const roles = $derived(page.data.enterprise ? await getRoles() : []);

	let editing = $state<{ id: string | null; title: string } | null>(null);
	let name = $state('');
	let permissions = $state<ApiPermissions>({});
	let pending = $state(false);

	function openCreate() {
		name = '';
		permissions = everything('read');
		editing = { id: null, title: 'New role' };
	}
	function openEdit(r: Role) {
		name = r.name;
		permissions = normalizePermissions(r.permissions);
		editing = { id: r.id, title: `Edit ${r.name}` };
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
			await saveRole({ id: editing.id ?? undefined, name, permissions });
			editing = null;
			toast.success('Role saved');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		} finally {
			pending = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Roles</Card.Title>
		<Card.Description
			>Custom permission matrices for members — same resources and levels as API keys. Assign them
			on the <a class="underline" href="/settings/team">Team</a> page. Owner and admin members are never
			restricted.</Card.Description
		>
		<Card.Action
			>{#if page.data.enterprise}<Button size="sm" onclick={openCreate}><Plus /> New role</Button
				>{/if}</Card.Action
		>
	</Card.Header>
	<Card.Content>
		{#if !page.data.enterprise}
			<p class="text-sm text-muted-foreground">
				Custom roles are an enterprise feature. Add <code>LEROA_ENTERPRISE_KEY</code> or run on Leroa
				Cloud to enable them.
			</p>
		{:else if roles.length}
			<ul class="divide-y rounded-lg border">
				{#each roles as r (r.id)}
					{@const summary = describePermissions(r.permissions)}
					<li class="flex items-start gap-3 p-3">
						<div class="min-w-0 flex-1 space-y-1.5">
							<p class="text-sm font-medium">
								{r.name}
								<span class="text-xs font-normal text-muted-foreground"
									>· {r.members} member{r.members === 1 ? '' : 's'}</span
								>
							</p>
							<div class="flex flex-wrap gap-1">
								{#if summary === 'custom'}
									{#each API_RESOURCES.filter((x) => levelOf(r.permissions, x) !== 'none') as x (x)}
										<Badge variant="outline"
											>{API_RESOURCE_LABELS[x]} · {levelOf(r.permissions, x) === 'write'
												? 'write'
												: 'read'}</Badge
										>
									{/each}
								{:else}
									<Badge variant="secondary">{summary}</Badge>
								{/if}
							</div>
						</div>
						<Button size="icon-sm" variant="ghost" aria-label="Edit" onclick={() => openEdit(r)}
							><Pencil /></Button
						>
						<Button
							size="icon-sm"
							variant="ghost"
							aria-label="Delete"
							onclick={() =>
								confirmDelete({
									title: `Delete ${r.name}?`,
									description: 'Members with this role go back to unrestricted member access.',
									onConfirm: () => deleteRole(r.id)
								})}><Trash /></Button
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">No roles yet.</p>
		{/if}
	</Card.Content>
</Card.Root>

<Modal.Root bind:open={() => !!editing, (v) => !v && (editing = null)}>
	<Modal.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<form onsubmit={save} class="space-y-5">
			<Modal.Header>
				<Modal.Title>{editing?.title}</Modal.Title>
				<Modal.Description>Anything outside these permissions returns 403.</Modal.Description>
			</Modal.Header>
			<Field.Field>
				<Field.Label for="role-name">Name</Field.Label>
				<Input id="role-name" placeholder="e.g. Leasing agent" required bind:value={name} />
			</Field.Field>
			<ApiPermissionsEditor bind:value={permissions} />
			<Modal.Footer>
				<Button type="submit" disabled={pending}>Save role</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
