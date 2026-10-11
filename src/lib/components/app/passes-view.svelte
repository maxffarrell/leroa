<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { toast } from 'svelte-sonner';
	import { addDays, formatDate, todayISO } from '#lib/format.ts';
	import { getProperties, getUnits, getTenants } from '#lib/remote/portfolio.remote.ts';
	import { closePass, createPass, getPasses } from '#lib/remote/residents.remote.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	const properties = $derived(await getProperties());
	const units = $derived(await getUnits());
	const tenants = $derived(await getTenants());
	const tenantName = (t: { firstName: string; lastName: string; companyName: string | null }) =>
		`${t.firstName} ${t.lastName}`.trim() || t.companyName || 'Resident';

	let showVoid = $state(false);
	const passes = $derived(await getPasses(showVoid));
	const active = (p: { status: string; endsOn: string }) =>
		p.status === 'active' && p.endsOn >= todayISO();

	let creating = $state(false);
	let fProperty = $state('');
	let fUnit = $state('');
	let fTenant = $state('');
	let fGuest = $state('');
	let fStart = $state(todayISO());
	let fEnd = $state(addDays(todayISO(), 1));
	let fNotes = $state('');
	const fUnits = $derived(units.filter((u) => u.propertyId === fProperty));

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!fProperty || !fGuest.trim()) return;
		try {
			await createPass({
				propertyId: fProperty,
				unitId: fUnit || null,
				tenantId: fTenant || null,
				guestName: fGuest.trim(),
				startsOn: fStart,
				endsOn: fEnd,
				notes: fNotes.trim() || null
			});
			toast.success(`Pass for ${fGuest.trim()} issued`);
			creating = false;
			fGuest = fNotes = '';
			fUnit = fTenant = '';
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not issue pass'
			);
		}
	}
</script>

<div class="mt-4 space-y-4">
	<div class="flex items-center gap-3">
		<Button size="sm" onclick={() => (creating = true)}><Plus /> New guest pass</Button>
		<span class="flex items-center gap-2 text-sm text-muted-foreground">
			<Checkbox id="passes-show-void" bind:checked={showVoid} />
			<Label for="passes-show-void" class="font-normal">Show closed</Label>
		</span>
	</div>
	<div class="overflow-x-auto rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Guest</Table.Head>
					<Table.Head>Host</Table.Head>
					<Table.Head class="hidden md:table-cell">Location</Table.Head>
					<Table.Head>Valid</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head class="w-32"></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each passes as p (p.id)}
					<Table.Row>
						<Table.Cell class="font-medium">{p.guestName}</Table.Cell>
						<Table.Cell
							>{`${p.tenantFirst ?? ''} ${p.tenantLast ?? ''}`.trim() ||
								p.tenantCompany ||
								'—'}</Table.Cell
						>
						<Table.Cell class="hidden text-muted-foreground md:table-cell"
							>{p.propertyName}{p.unitName ? ` · ${p.unitName}` : ''}</Table.Cell
						>
						<Table.Cell class="text-muted-foreground tabular-nums"
							>{formatDate(p.startsOn, true)} → {formatDate(p.endsOn, true)}</Table.Cell
						>
						<Table.Cell>
							{#if active(p)}
								<Badge>Active</Badge>
							{:else if p.status === 'used'}
								<Badge variant="secondary">Used</Badge>
							{:else if p.status === 'void'}
								<Badge variant="secondary">Void</Badge>
							{:else}
								<Badge variant="outline">Expired</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							{#if p.status === 'active'}
								<Button
									size="sm"
									variant="outline"
									onclick={() => closePass({ id: p.id, status: 'used' })}>Used</Button
								>
								<Button
									size="sm"
									variant="ghost"
									class="text-muted-foreground"
									onclick={() =>
										confirmDelete({
											title: `Void pass for ${p.guestName}?`,
											description: 'It stays on the log, marked void.',
											confirm: { text: 'Void' },
											onConfirm: async () => {
												await closePass({ id: p.id, status: 'void' }).catch(() =>
													toast.error('Could not void')
												);
											}
										})}>Void</Button
								>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row
						><Table.Cell colspan={6} class="py-8 text-center text-muted-foreground"
							>No active guest passes.</Table.Cell
						></Table.Row
					>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<Modal.Root bind:open={creating}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={save}>
			<Modal.Header>
				<Modal.Title>New guest pass</Modal.Title>
				<Modal.Description>A dated pass for a resident's visitor.</Modal.Description>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Guest name</Field.Label>
				<Input bind:value={fGuest} placeholder="Sam Rivera" />
			</Field.Field>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Valid from</Field.Label>
					<Input type="date" bind:value={fStart} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Through</Field.Label>
					<Input type="date" bind:value={fEnd} min={fStart} />
				</Field.Field>
			</div>
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
				<Field.Label>Host resident</Field.Label>
				<NativeSelect.Root bind:value={fTenant} class="w-full">
					<NativeSelect.Option value="">—</NativeSelect.Option>
					{#each tenants as t (t.id)}
						<NativeSelect.Option value={t.id}>{tenantName(t)}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Notes</Field.Label>
				<Input bind:value={fNotes} placeholder="Car make, pets, purpose…" />
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (creating = false)}>Cancel</Button>
				<Button type="submit" disabled={!fProperty || !fGuest.trim()}>Issue pass</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
