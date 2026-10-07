<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client.ts';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { CopyButton } from '#lib/components/ui/copy-button/index.js';
	import { toast } from 'svelte-sonner';

	const org = $derived(page.data.org!);
	const canEdit = $derived(page.data.role !== 'member');
	let name = $state(page.data.org!.name);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		const { error } = await authClient.organization.update({
			organizationId: org.id,
			data: { name }
		});
		if (error) return toast.error(error.message ?? 'Could not save');
		toast.success('Saved');
		await invalidateAll();
	}
</script>

<Card.Root>
	<Card.Header
		><Card.Title>Workspace</Card.Title><Card.Description
			>Shown to your team and in the tenant portal.</Card.Description
		></Card.Header
	>
	<Card.Content>
		<form class="flex items-end gap-3" onsubmit={save}>
			<Field.Field class="flex-1"
				><Field.Label for="org-name">Name</Field.Label><Input
					id="org-name"
					bind:value={name}
					disabled={!canEdit}
					required
				/></Field.Field
			>
			<Button type="submit" disabled={!canEdit || name === org.name}>Save</Button>
		</form>
	</Card.Content>
</Card.Root>
<Card.Root>
	<Card.Header
		><Card.Title>Get familiar</Card.Title><Card.Description
			>Take the guided tour of the interface again — it opens on the dashboard.</Card.Description
		></Card.Header
	>
	<Card.Content>
		<Button variant="outline" onclick={() => goto('/dashboard?tour=1')}>Replay the tour</Button>
	</Card.Content>
</Card.Root>
<Card.Root>
	<Card.Header
		><Card.Title>Workspace ID</Card.Title><Card.Description
			>Use this when calling the API or configuring integrations.</Card.Description
		></Card.Header
	>
	<Card.Content
		><div class="flex items-center gap-2">
			<code class="rounded bg-muted px-2 py-1 font-mono text-sm">{org.id}</code>
			<CopyButton size="icon-sm" variant="ghost" aria-label="Copy workspace ID" text={org.id} />
		</div></Card.Content
	>
</Card.Root>
