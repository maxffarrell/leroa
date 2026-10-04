<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client.ts';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { getMembers } from '#lib/remote/workspace.remote.ts';
	import { initials } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Copy from '@lucide/svelte/icons/copy';

	const members = $derived(await getMembers());
	const canManage = $derived(page.data.role !== 'member');
	let email = $state('');
	let role = $state<'member' | 'admin'>('member');
	let inviteLink = $state<string | null>(null);

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
				<li class="flex items-center gap-3 px-6 py-3">
					<Avatar.Root class="size-8"
						>{#if m.image}<Avatar.Image src={m.image} alt={m.name} />{/if}<Avatar.Fallback
							>{initials(m.name)}</Avatar.Fallback
						></Avatar.Root
					>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium">
							{m.name}{m.userId === page.data.user?.id ? ' (you)' : ''}
						</p>
						<p class="truncate text-xs text-muted-foreground">{m.email}</p>
					</div>
					{#if canManage && m.role !== 'owner' && m.userId !== page.data.user?.id}
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
