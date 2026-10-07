<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { getFields, saveField, setFieldArchived } from '#lib/remote/fields.remote.ts';
	import { FIELD_ENTITIES, FIELD_TYPES } from '#lib/schemas.ts';
	import Plus from '@lucide/svelte/icons/plus';

	const isAdmin = $derived(page.data.role !== 'member');
	const entityLabel = (e: string) => `${e[0]!.toUpperCase()}${e.slice(1)}s`;

	let entity = $state<(typeof FIELD_ENTITIES)[number]>('tenant');
	const fields = $derived(await getFields(entity));

	let name = $state('');
	let type = $state<(typeof FIELD_TYPES)[number]>('text');
	let options = $state('');
	let saving = $state(false);

	async function add() {
		if (!name.trim()) return;
		saving = true;
		try {
			await saveField({
				entity,
				name: name.trim(),
				type,
				options:
					type === 'select'
						? options
								.split(',')
								.map((o) => o.trim())
								.filter(Boolean)
						: undefined
			});
			name = '';
			options = '';
		} catch (e) {
			toast.error((e as { body?: { message?: string } })?.body?.message ?? 'Could not save field');
		} finally {
			saving = false;
		}
	}

	async function toggle(f: (typeof fields)[number]) {
		await setFieldArchived({ id: f.id, entity, archived: !f.archivedAt });
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Custom fields</Card.Title>
		<Card.Description>
			Add fields to any record — tenants, properties, vendors and more. They appear on each record's
			page for everyone in the workspace.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<NativeSelect.Root aria-label="Record type" class="h-8 w-44" bind:value={entity}>
			{#each FIELD_ENTITIES as e (e)}
				<NativeSelect.Option value={e}>{entityLabel(e)}</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>

		{#if fields.length === 0}
			<p class="py-6 text-center text-sm text-muted-foreground">
				No custom fields on {entityLabel(entity).toLowerCase()} yet.
			</p>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head class="w-28">Type</Table.Head>
							<Table.Head>Options</Table.Head>
							<Table.Head class="w-24"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each fields as f (f.id)}
							<Table.Row class={f.archivedAt ? 'opacity-50' : ''}>
								<Table.Cell class="text-sm font-medium">{f.name}</Table.Cell>
								<Table.Cell
									><Badge variant="outline" class="font-normal">{f.type}</Badge></Table.Cell
								>
								<Table.Cell class="text-xs text-muted-foreground"
									>{f.type === 'select' ? (f.options ?? []).join(', ') || '—' : '—'}</Table.Cell
								>
								<Table.Cell class="text-right">
									{#if isAdmin}
										<Button variant="ghost" size="sm" class="h-7" onclick={() => toggle(f)}
											>{f.archivedAt ? 'Restore' : 'Archive'}</Button
										>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}

		{#if isAdmin}
			<div class="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
				<label class="flex flex-col gap-1 text-xs text-muted-foreground">
					Field name
					<Input
						class="h-8 w-44"
						placeholder="e.g. Pet deposit"
						bind:value={name}
						onkeydown={(e) => e.key === 'Enter' && add()}
					/>
				</label>
				<label class="flex flex-col gap-1 text-xs text-muted-foreground">
					Type
					<NativeSelect.Root class="h-8 w-32" bind:value={type}>
						{#each FIELD_TYPES as t (t)}
							<NativeSelect.Option value={t}>{t}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</label>
				{#if type === 'select'}
					<label class="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
						Options (comma separated)
						<Input class="h-8" placeholder="Cat, Dog, Other" bind:value={options} />
					</label>
				{/if}
				<Button size="sm" class="h-8" onclick={add} disabled={saving || !name.trim()}>
					<Plus class="size-4" /> Add field
				</Button>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">Only owners and admins can change fields.</p>
		{/if}
	</Card.Content>
</Card.Root>
