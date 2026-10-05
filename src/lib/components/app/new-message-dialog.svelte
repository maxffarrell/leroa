<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Command from '#lib/components/ui/command/index.js';
	import { goto } from '$app/navigation';
	import { getTenants } from '#lib/remote/portfolio.remote.ts';
	import { tenantName } from '#lib/format.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const tenants = $derived(open ? await getTenants() : []);

	async function pick(id: string) {
		open = false;
		await goto(`/messages/${id}`);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-md">
		<Dialog.Header class="p-4 pb-2">
			<Dialog.Title>New message</Dialog.Title>
			<Dialog.Description>Pick a tenant to message.</Dialog.Description>
		</Dialog.Header>
		<Command.Root class="border-t">
			<Command.Input placeholder="Search tenants…" />
			<Command.List class="max-h-80">
				<Command.Empty>No tenants found.</Command.Empty>
				{#each tenants as t (t.id)}
					{@const name = tenantName(t)}
					<Command.Item
						value={`${name} ${t.propertyName ?? ''} ${t.unitName ?? ''} ${t.id}`}
						onSelect={() => pick(t.id)}
					>
						<span class="truncate">{name}</span>
						{#if t.unitName}<span class="ml-auto truncate text-xs text-muted-foreground"
								>{t.propertyName} · {t.unitName}</span
							>{/if}
					</Command.Item>
				{/each}
			</Command.List>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
