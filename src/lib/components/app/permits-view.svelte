<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { toast } from 'svelte-sonner';
	import { formatDate, todayISO } from '#lib/format.ts';
	import { getProperties, getUnits, getTenants } from '#lib/remote/portfolio.remote.ts';
	import { getPermits, issuePermit, revokePermit } from '#lib/remote/residents.remote.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import CircleOff from '@lucide/svelte/icons/circle-off';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';

	const properties = $derived(await getProperties());
	const units = $derived(await getUnits());
	const tenants = $derived(await getTenants());
	const tenantName = (t: { firstName: string; lastName: string; companyName: string | null }) =>
		`${t.firstName} ${t.lastName}`.trim() || t.companyName || 'Resident';

	let showRevoked = $state(false);
	const permits = $derived(await getPermits(showRevoked));

	let issuing = $state(false);
	let fProperty = $state('');
	let fUnit = $state('');
	let fTenant = $state('');
	let fNumber = $state('');
	let fVehicle = $state('');
	let fExpires = $state('');
	let fNotes = $state('');
	const fUnits = $derived(units.filter((u) => u.propertyId === fProperty));

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!fProperty || !fNumber.trim()) return;
		try {
			await issuePermit({
				propertyId: fProperty,
				unitId: fUnit || null,
				tenantId: fTenant || null,
				permitNumber: fNumber.trim(),
				vehicle: fVehicle.trim() || null,
				expiresOn: fExpires || null,
				notes: fNotes.trim() || null
			});
			toast.success(`Permit ${fNumber.trim()} issued`);
			issuing = false;
			fNumber = fVehicle = fExpires = fNotes = '';
			fUnit = fTenant = '';
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not issue permit'
			);
		}
	}

	const revoke = (id: string, num: string) =>
		confirmDelete({
			title: `Revoke permit ${num}?`,
			description: 'It stays on the log as revoked.',
			onConfirm: async () => {
				await revokePermit(id).catch(() => toast.error('Could not revoke'));
			}
		});
</script>

<div class="mt-4 space-y-4">
	<div class="flex items-center gap-3">
		<Button size="sm" onclick={() => (issuing = true)}><Plus /> Issue permit</Button>
		<label class="flex items-center gap-2 text-sm text-muted-foreground"
			><input type="checkbox" bind:checked={showRevoked} class="accent-primary" /> Show revoked</label
		>
	</div>
	<div class="overflow-hidden rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Permit</Table.Head>
					<Table.Head>Resident</Table.Head>
					<Table.Head class="hidden md:table-cell">Location</Table.Head>
					<Table.Head class="hidden lg:table-cell">Vehicle</Table.Head>
					<Table.Head class="hidden sm:table-cell">Expires</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head class="w-24"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each permits as p (p.id)}
					<Table.Row>
						<Table.Cell class="font-medium">{p.permitNumber}</Table.Cell>
						<Table.Cell
							>{p.tenantId
								? `${p.tenantFirst} ${p.tenantLast}`.trim() || p.tenantCompany
								: '—'}</Table.Cell
						>
						<Table.Cell class="hidden text-muted-foreground md:table-cell"
							>{p.propertyName}{p.unitName ? ` · ${p.unitName}` : ''}</Table.Cell
						>
						<Table.Cell class="hidden max-w-48 truncate text-muted-foreground lg:table-cell"
							>{p.vehicle ?? '—'}</Table.Cell
						>
						<Table.Cell class="hidden text-muted-foreground sm:table-cell"
							>{p.expiresOn ? formatDate(p.expiresOn) : '—'}</Table.Cell
						>
						<Table.Cell>
							{#if p.status === 'revoked'}
								<Badge variant="secondary">Revoked</Badge>
							{:else}
								<Badge>Active</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							{#if p.status === 'active'}
								<Button size="sm" variant="outline" onclick={() => revoke(p.id, p.permitNumber)}
									><CircleOff /> Revoke</Button
								>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row
						><Table.Cell colspan={7} class="py-8 text-center text-muted-foreground"
							>No active permits.</Table.Cell
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
				<Modal.Title>Issue a parking permit</Modal.Title>
				<Modal.Description>Tie a permit number to a resident and vehicle.</Modal.Description>
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
					<Field.Label>Permit #</Field.Label>
					<Input bind:value={fNumber} placeholder="A-0142" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Expires</Field.Label>
					<Input type="date" bind:value={fExpires} min={todayISO()} />
				</Field.Field>
			</div>
			<Field.Field>
				<Field.Label>Vehicle</Field.Label>
				<Input bind:value={fVehicle} placeholder="Blue Honda Civic · ABC 1234" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Notes</Field.Label>
				<Input bind:value={fNotes} placeholder="Optional" />
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (issuing = false)}>Cancel</Button>
				<Button type="submit" disabled={!fProperty || !fNumber.trim()}>Issue</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
