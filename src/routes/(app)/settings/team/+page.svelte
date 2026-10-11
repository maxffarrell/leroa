<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client.ts';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { getMembers } from '#lib/remote/workspace.remote.ts';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import {
		getMemberAccess,
		assignMemberRole,
		setMemberScope,
		getRoles
	} from '#lib/remote/roles.remote.ts';
	import { initials } from '#lib/format.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import Copy from '@lucide/svelte/icons/copy';
	import Building2 from '@lucide/svelte/icons/building-2';

	const members = $derived(await getMembers());
	const canManage = $derived(page.data.role !== 'member');
	const enterprise = $derived(!!page.data.enterprise);
	const roles = $derived(enterprise && canManage ? await getRoles() : []);
	const access = $derived(
		enterprise && canManage
			? new Map((await getMemberAccess()).map((a) => [a.memberId, a]))
			: new Map()
	);
	const properties = $derived(await getProperties());

	let email = $state('');
	let role = $state<'member' | 'admin'>('member');
	let inviteLink = $state<string | null>(null);

	let scopeFor = $state<{ memberId: string; name: string } | null>(null);
	let scopeDraft = new SvelteSet<string>();
	let scopeAll = $state(true);
	let pending = $state(false);

	async function invite(e: SubmitEvent) {
		e.preventDefault();
		const { data, error } = await authClient.organization.inviteMember({ email, role });
		if (error || !data) return toast.error(error?.message ?? 'Could not invite');
		inviteLink = `${location.origin}/invite/${data.id}`;
		email = '';
		toast.success('Invitation created');
	}

	async function changeRole(memberId: string, value: string) {
		const { error } = await authClient.organization.updateMemberRole({
			memberId,
			role: value as 'member' | 'admin'
		});
		if (error) return toast.error(error.message ?? 'Could not change role');
		await getMembers().refresh();
	}

	async function changeCustomRole(memberId: string, customRoleId: string | null) {
		try {
			await assignMemberRole({ memberId, customRoleId });
			toast.success('Access updated');
		} catch {
			toast.error('Could not update access');
		}
	}

	function openScope(memberId: string, name: string) {
		const ids = access.get(memberId)?.propertyIds ?? [];
		scopeAll = ids.length === 0;
		scopeDraft.clear();
		for (const id of ids) scopeDraft.add(id);
		scopeFor = { memberId, name };
	}

	async function saveScope() {
		if (!scopeFor) return;
		pending = true;
		try {
			await setMemberScope({
				memberId: scopeFor.memberId,
				propertyIds: scopeAll ? [] : [...scopeDraft]
			});
			scopeFor = null;
			toast.success('Property scope updated');
		} catch {
			toast.error('Could not update scope');
		} finally {
			pending = false;
		}
	}

	async function remove(memberId: string) {
		if (!confirm('Remove this member?')) return;
		const { error } = await authClient.organization.removeMember({ memberIdOrEmail: memberId });
		if (error) return toast.error(error.message ?? 'Could not remove');
		await getMembers().refresh();
	}
</script>

{#if canManage}
	<Card.Root>
		<Card.Header
			><Card.Title>Invite a teammate</Card.Title><Card.Description
				>Admins can manage settings, integrations and the team.</Card.Description
			></Card.Header
		>
		<Card.Content class="space-y-3">
			<form class="flex flex-wrap gap-2" onsubmit={invite}>
				<Input
					type="email"
					placeholder="name@company.com"
					class="min-w-56 flex-1"
					required
					bind:value={email}
				/>
				<Select.Root type="single" bind:value={role}>
					<Select.Trigger class="w-28 capitalize">{role}</Select.Trigger>
					<Select.Content
						><Select.Item value="member">Member</Select.Item><Select.Item value="admin"
							>Admin</Select.Item
						></Select.Content
					>
				</Select.Root>
				<Button type="submit">Invite</Button>
			</form>
			{#if inviteLink}
				<div class="flex items-center gap-2 rounded-md bg-muted p-2 text-sm">
					<code class="min-w-0 flex-1 truncate">{inviteLink}</code>
					<Button
						size="icon-sm"
						variant="ghost"
						aria-label="Copy link"
						onclick={() =>
							navigator.clipboard.writeText(inviteLink!).then(() => toast.success('Copied'))}
						><Copy /></Button
					>
				</div>
				<p class="text-xs text-muted-foreground">
					Send this link to your teammate. It expires in 48 hours.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}

<Card.Root>
	<Card.Header><Card.Title>Members</Card.Title></Card.Header>
	<Card.Content class="px-0">
		<ul class="divide-y">
			{#each members as m (m.id)}
				{@const a = access.get(m.id)}
				<li class="flex flex-wrap items-center gap-3 px-6 py-3">
					<Avatar.Root class="size-8"
						>{#if m.image}<Avatar.Image src={m.image} alt={m.name} />{/if}<Avatar.Fallback
							>{initials(m.name)}</Avatar.Fallback
						></Avatar.Root
					>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">
							{m.name}{m.userId === page.data.user?.id ? ' (you)' : ''}
						</p>
						<p class="truncate text-xs text-muted-foreground">
							{m.email}{#if a?.customRoleId}
								· {roles.find((r) => r.id === a.customRoleId)?.name}{/if}{#if a?.propertyIds.length}
								· {a.propertyIds.length}
								{a.propertyIds.length === 1 ? 'property' : 'properties'}{/if}
						</p>
					</div>
					{#if canManage && m.role !== 'owner' && m.userId !== page.data.user?.id}
						{#if enterprise && m.role === 'member'}
							<Select.Root
								type="single"
								value={a?.customRoleId ?? ''}
								onValueChange={(v) => changeCustomRole(m.id, v || null)}
							>
								<Select.Trigger size="sm" class="w-36"
									>{a?.customRoleId
										? (roles.find((r) => r.id === a.customRoleId)?.name ?? 'Role')
										: 'Full access'}</Select.Trigger
								>
								<Select.Content>
									<Select.Item value="">Full access</Select.Item>
									{#each roles as r (r.id)}
										<Select.Item value={r.id}>{r.name}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						{/if}
						<Button
							size="sm"
							variant="ghost"
							aria-label="Property scope"
							onclick={() => openScope(m.id, m.name)}
							><Building2 />{a?.propertyIds.length ? a.propertyIds.length : 'All'}</Button
						>
						<Select.Root type="single" value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
							<Select.Trigger size="sm" class="w-24 capitalize">{m.role}</Select.Trigger>
							<Select.Content
								><Select.Item value="member">Member</Select.Item><Select.Item value="admin"
									>Admin</Select.Item
								></Select.Content
							>
						</Select.Root>
						<Button size="sm" variant="ghost" class="text-destructive" onclick={() => remove(m.id)}
							>Remove</Button
						>
					{:else}
						<span class="text-xs text-muted-foreground capitalize">{m.role}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</Card.Content>
</Card.Root>

<Modal.Root bind:open={() => !!scopeFor, (v) => !v && (scopeFor = null)}>
	<Modal.Content class="sm:max-w-md">
		<Modal.Header>
			<Modal.Title>Properties for {scopeFor?.name}</Modal.Title>
			<Modal.Description
				>Limit which properties this member can see and work on. "All properties" includes future
				ones.</Modal.Description
			>
		</Modal.Header>
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<Checkbox id="scope-all" checked={scopeAll} onCheckedChange={(v) => (scopeAll = !!v)} />
				<Label for="scope-all">All properties</Label>
			</div>
			{#if !scopeAll}
				<ul class="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
					{#each properties as p (p.id)}
						<li class="flex items-center gap-2">
							<Checkbox
								id="scope-{p.id}"
								checked={scopeDraft.has(p.id)}
								onCheckedChange={(v) => {
									if (v) scopeDraft.add(p.id);
									else scopeDraft.delete(p.id);
								}}
							/>
							<Label for="scope-{p.id}">{p.name}</Label>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<Modal.Footer>
			<Button onclick={saveScope} disabled={pending || (!scopeAll && scopeDraft.size === 0)}>
				Save
			</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
