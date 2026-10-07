<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { toast } from 'svelte-sonner';
	import { formatRelative } from '#lib/format.ts';
	import { KEY_KINDS, KEY_KIND_LABELS, type KeyKind } from '#lib/schemas.ts';
	import { getProperties, getUnits, getTenants } from '#lib/remote/portfolio.remote.ts';
	import { closeKey, getKeys, issueKey } from '#lib/remote/residents.remote.ts';
	import Plus from '@lucide/svelte/icons/plus';

	const properties = $derived(await getProperties());
	const units = $derived(await getUnits());
	const tenants = $derived(await getTenants());
	const tenantName = (t: { firstName: string; lastName: string; companyName: string | null }) =>
		`${t.firstName} ${t.lastName}`.trim() || t.companyName || 'Resident';

	let showClosed = $state(false);
	const keys = $derived(await getKeys(showClosed));

	let issuing = $state(false);
	let fProperty = $state('');
	let fUnit = $state('');
	let fTenant = $state('');
	let fKind = $state<KeyKind>('key');
	let fLabel = $state('');
	let fNotes = $state('');
	const fUnits = $derived(units.filter((u) => u.propertyId === fProperty));

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!fProperty || !fLabel.trim()) return;
		try {
			await issueKey({
				propertyId: fProperty,
				unitId: fUnit || null,
				tenantId: fTenant || null,
				kind: fKind,
				label: fLabel.trim(),
				notes: fNotes.trim() || null
			});
			toast.success(`${KEY_KIND_LABELS[fKind]} ${fLabel.trim()} issued`);
			issuing = false;
			fLabel = fNotes = '';
			fUnit = fTenant = '';
		} catch {
			toast.error('Could not issue');
		}
	}

	async function close(id: string, status: 'returned' | 'lost') {
		await closeKey({ id, status }).catch(() => toast.error('Could not update'));
	}
</script>

<div class="mt-4 space-y-4">
	<div class="flex items-center gap-3">
		<Button size="sm" onclick={() => (issuing = true)}><Plus /> Issue key/fob</Button>
		<label class="flex items-center gap-2 text-sm text-muted-foreground"
			><input type="checkbox" bind:checked={showClosed} class="accent-primary" /> Show returned/lost</label
		>
	</div>
	<div class="overflow-x-auto rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Item</Table.Head>
					<Table.Head>Resident</Table.Head>
					<Table.Head class="hidden md:table-cell">Location</Table.Head>
					<Table.Head class="hidden sm:table-cell">Issued</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head class="w-40"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each keys as k (k.id)}
					<Table.Row>
						<Table.Cell class="font-medium"
							>{k.label}
							<span class="text-xs text-muted-foreground">{KEY_KIND_LABELS[k.kind]}</span
							></Table.Cell
						>
						<Table.Cell
							>{`${k.tenantFirst ?? ''} ${k.tenantLast ?? ''}`.trim() ||
								k.tenantCompany ||
								'—'}</Table.Cell
						>
						<Table.Cell class="hidden text-muted-foreground md:table-cell"
							>{k.propertyName}{k.unitName ? ` · ${k.unitName}` : ''}</Table.Cell
						>
						<Table.Cell class="hidden text-muted-foreground sm:table-cell"
							>{k.issuedAt ? formatRelative(k.issuedAt) : '—'}</Table.Cell
						>
						<Table.Cell>
							{#if k.status === 'issued'}
								<Badge>Issued</Badge>
							{:else if k.status === 'lost'}
								<Badge variant="destructive">Lost</Badge>
							{:else}
								<Badge variant="secondary">Returned</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							{#if k.status === 'issued'}
								<Button size="sm" variant="outline" onclick={() => close(k.id, 'returned')}
									>Returned</Button
								>
								<Button
									size="sm"
									variant="ghost"
									class="text-muted-foreground"
									onclick={() => close(k.id, 'lost')}>Lost</Button
								>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row
						><Table.Cell colspan={6} class="py-8 text-center text-muted-foreground"
							>Nothing issued.</Table.Cell
						></Table.Row
					>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<Modal.Root bind:open={issuing}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={save}>
			<Modal.Header>
				<Modal.Title>Issue a key or fob</Modal.Title>
				<Modal.Description>Track who holds which physical access item.</Modal.Description>
			</Modal.Header>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Property</Field.Label>
					<NativeSelect.Root bind:value={fProperty} onchange={() => (fUnit = '')} class="w-full">
						<NativeSelect.Option value="" disabled>Pick a property</NativeSelect.Option>
						{#each properties as p (p.id)}
							<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label>Unit</Field.Label>
					<NativeSelect.Root bind:value={fUnit} class="w-full" disabled={!fProperty}>
						<NativeSelect.Option value="">—</NativeSelect.Option>
						{#each fUnits as u (u.id)}
							<NativeSelect.Option value={u.id}>{u.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			</div>
			<Field.Field>
				<Field.Label>Resident</Field.Label>
				<NativeSelect.Root bind:value={fTenant} class="w-full">
					<NativeSelect.Option value="">—</NativeSelect.Option>
					{#each tenants as t (t.id)}
						<NativeSelect.Option value={t.id}>{tenantName(t)}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Type</Field.Label>
					<NativeSelect.Root bind:value={fKind} class="w-full">
						{#each KEY_KINDS as kk (kk)}
							<NativeSelect.Option value={kk}>{KEY_KIND_LABELS[kk]}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label>Label</Field.Label>
					<Input bind:value={fLabel} placeholder="Unit 3A front door · fob #4471" />
				</Field.Field>
			</div>
			<Field.Field>
				<Field.Label>Notes</Field.Label>
				<Input bind:value={fNotes} placeholder="Optional" />
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (issuing = false)}>Cancel</Button>
				<Button type="submit" disabled={!fProperty || !fLabel.trim()}>Issue</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
