<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import TicketForm from '#lib/components/app/ticket-form.svelte';
	import { createAsset, getAsset, getAssets, updateAsset } from '#lib/remote/operations.remote.ts';
	import { getProperties, getUnits } from '#lib/remote/portfolio.remote.ts';
	import { getVendors } from '#lib/remote/vendors.remote.ts';
	import { assetKinds } from '#lib/schemas.ts';
	import { insuranceState } from '#lib/vendors.ts';
	import { formatDate, formatMoney, formatRelative, todayISO } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import type { AssetRow } from '#lib/server/services/assets.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Wrench from '@lucide/svelte/icons/wrench';

	const assets = $derived(await getAssets());
	let showArchived = $state(false);
	const shown = $derived(assets.filter((a) => showArchived || !a.archivedAt));

	let editing = $state<AssetRow | null>(null);
	let creating = $state(false);
	const dialogOpen = $derived(creating || !!editing);
	const setDialog = (o: boolean) => {
		if (!o) {
			creating = false;
			editing = null;
		}
	};

	let selectedId = $state<string | null>(null);
	const detail = $derived(selectedId ? await getAsset(selectedId) : null);
	let addingWork = $state(false);

	const properties = $derived(dialogOpen ? await getProperties() : []);
	const units = $derived(dialogOpen ? await getUnits() : []);
	const vendors = $derived(dialogOpen ? await getVendors(false) : []);

	const KIND_LABEL: Record<string, string> = {
		appliance: 'Appliance',
		boiler: 'Boiler',
		electrical: 'Electrical',
		elevator: 'Elevator',
		hvac: 'HVAC',
		laundry: 'Laundry',
		plumbing: 'Plumbing',
		pool: 'Pool',
		roof: 'Roof',
		safety: 'Safety',
		water_heater: 'Water heater',
		other: 'Other'
	};

	function warranty(a: { warrantyExpiresOn: string | null }) {
		const state = insuranceState(a.warrantyExpiresOn, todayISO());
		if (state === 'missing') return { label: 'No warranty on file', tone: 'text-muted-foreground' };
		if (state === 'expired')
			return {
				label: `Expired ${formatDate(a.warrantyExpiresOn, true)}`,
				tone: 'text-red-600 dark:text-red-400'
			};
		if (state === 'expiring')
			return {
				label: `Expires ${formatDate(a.warrantyExpiresOn, true)}`,
				tone: 'text-amber-600 dark:text-amber-400'
			};
		return {
			label: `Warranty to ${formatDate(a.warrantyExpiresOn, true)}`,
			tone: 'text-muted-foreground'
		};
	}

	// Form state
	let fName = $state('');
	let fKind = $state<string>('other');
	let fProperty = $state('');
	let fUnit = $state('');
	let fVendor = $state('');
	let fMake = $state('');
	let fModel = $state('');
	let fSerial = $state('');
	let fInstalled = $state('');
	let fWarranty = $state('');
	let fNotes = $state('');
	let pending = $state(false);

	$effect(() => {
		if (dialogOpen) {
			fName = editing?.name ?? '';
			fKind = editing?.kind ?? 'other';
			fProperty = editing?.propertyId ?? '';
			fUnit = editing?.unitId ?? '';
			fVendor = editing?.vendorId ?? '';
			fMake = editing?.make ?? '';
			fModel = editing?.model ?? '';
			fSerial = editing?.serialNumber ?? '';
			fInstalled = editing?.installedOn ?? '';
			fWarranty = editing?.warrantyExpiresOn ?? '';
			fNotes = editing?.notes ?? '';
		}
	});

	const propUnits = $derived(units.filter((u) => u.propertyId === fProperty));
	const selName = <T extends { id: string; name?: string | null }>(list: T[], id: string) =>
		list.find((x) => x.id === id)?.name;

	const errMsg = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		const fields = {
			name: fName,
			kind: fKind as (typeof assetKinds)[number],
			unitId: fUnit || null,
			vendorId: fVendor || null,
			make: fMake || null,
			model: fModel || null,
			serialNumber: fSerial || null,
			installedOn: fInstalled || null,
			warrantyExpiresOn: fWarranty || null,
			notes: fNotes || null
		};
		try {
			if (editing) {
				await updateAsset({ id: editing.id, ...fields });
				toast.success('Asset updated');
			} else {
				await createAsset({ propertyId: fProperty, ...fields });
				toast.success('Asset added');
			}
			setDialog(false);
		} catch (err) {
			toast.error(errMsg(err, 'Could not save the asset'));
		} finally {
			pending = false;
		}
	}

	async function archive(a: { id: string; archivedAt: string | Date | null }) {
		try {
			await updateAsset({ id: a.id, archived: !a.archivedAt });
			toast.success(a.archivedAt ? 'Asset restored' : 'Asset archived');
			if (selectedId === a.id) selectedId = null;
		} catch (err) {
			toast.error(errMsg(err, 'Could not update the asset'));
		}
	}
</script>

<div class="flex flex-wrap items-center gap-3">
	<Button size="sm" onclick={() => (creating = true)}><Plus /> New asset</Button>
	<label class="flex items-center gap-2 text-sm text-muted-foreground"
		><input type="checkbox" bind:checked={showArchived} class="accent-primary" /> Show archived</label
	>
	<p class="ml-auto hidden text-xs text-muted-foreground md:block">
		Track equipment, warranties and service history per property or unit.
	</p>
</div>

{#if shown.length === 0}
	<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
		No assets yet — add HVAC, water heaters, appliances and anything else with a warranty or a
		service history.
	</p>
{:else}
	<div class="overflow-x-auto rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Asset</Table.Head>
					<Table.Head class="hidden sm:table-cell">Where</Table.Head>
					<Table.Head class="hidden md:table-cell">Make / model</Table.Head>
					<Table.Head class="hidden sm:table-cell">Warranty</Table.Head>
					<Table.Head class="hidden lg:table-cell">Jobs</Table.Head>
					<Table.Head class="w-10"><span class="sr-only">Edit</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each shown as a (a.id)}
					<Table.Row class={a.archivedAt ? 'opacity-55' : ''}>
						<Table.Cell>
							<button
								type="button"
								class="font-medium hover:underline"
								onclick={() => (selectedId = a.id)}>{a.name}</button
							>
							<p class="text-xs text-muted-foreground sm:hidden">
								{a.propertyName}{a.unitName ? ` · ${a.unitName}` : ''}
							</p>
							<span class="mt-1 inline-block"><StatusBadge status={a.kind} /></span>
						</Table.Cell>
						<Table.Cell class="hidden sm:table-cell"
							>{a.propertyName}{a.unitName ? ` · ${a.unitName}` : ''}</Table.Cell
						>
						<Table.Cell class="hidden md:table-cell"
							>{[a.make, a.model].filter(Boolean).join(' ') || '—'}</Table.Cell
						>
						<Table.Cell class="hidden whitespace-nowrap sm:table-cell"
							><span class={warranty(a).tone}>{warranty(a).label}</span></Table.Cell
						>
						<Table.Cell class="hidden lg:table-cell"
							>{a.jobCount}{a.openTickets ? ` (${a.openTickets} open)` : ''}</Table.Cell
						>
						<Table.Cell>
							<Button variant="ghost" size="icon" title="Edit" onclick={() => (editing = a)}
								><Pencil /></Button
							>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<Sheet.Root open={!!selectedId} onOpenChange={(o) => !o && (selectedId = null)}>
	<Sheet.Content class="w-full gap-0 sm:max-w-md">
		{#if detail}
			<Sheet.Header>
				<Sheet.Description
					>{detail.property?.name}{detail.unit ? ` · ${detail.unit.name}` : ''}</Sheet.Description
				>
				<Sheet.Title class="text-lg">{detail.name}</Sheet.Title>
			</Sheet.Header>
			<div class="space-y-4 overflow-y-auto px-4 pb-4">
				<div class="flex items-center gap-2">
					<StatusBadge status={detail.kind} />
					<span class={warranty(detail).tone + ' text-xs'}>{warranty(detail).label}</span>
				</div>
				<dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
					{#if detail.make || detail.model}
						<dt class="text-muted-foreground">Make / model</dt>
						<dd>
							{[detail.make, detail.model].filter(Boolean).join(' ')}
						</dd>
					{/if}
					{#if detail.serialNumber}
						<dt class="text-muted-foreground">Serial</dt>
						<dd class="font-mono text-xs">{detail.serialNumber}</dd>
					{/if}
					{#if detail.installedOn}
						<dt class="text-muted-foreground">Installed</dt>
						<dd>{formatDate(detail.installedOn)}</dd>
					{/if}
					{#if detail.vendor}
						<dt class="text-muted-foreground">Service vendor</dt>
						<dd>
							<a class="hover:underline" href="/vendors/{detail.vendor.id}">{detail.vendor.name}</a>
						</dd>
					{/if}
				</dl>
				{#if detail.notes}<p class="text-sm whitespace-pre-wrap">{detail.notes}</p>{/if}
				<div class="flex flex-wrap gap-2">
					<Button size="sm" variant="outline" onclick={() => (addingWork = true)}
						><Wrench /> New work order</Button
					>
					<Button
						size="sm"
						variant="outline"
						onclick={() => (editing = assets.find((x) => x.id === detail!.id) ?? null)}
						><Pencil /> Edit</Button
					>
					<Button size="sm" variant="ghost" onclick={() => archive(detail)}
						>{detail.archivedAt ? 'Restore' : 'Archive'}</Button
					>
				</div>
				<section aria-label="Service history">
					<h3 class="mb-2 text-sm font-medium">Service history</h3>
					{#if detail.history.length === 0}
						<p class="text-sm text-muted-foreground">No work orders logged yet.</p>
					{:else}
						<ul class="space-y-1.5">
							{#each detail.history as h (h.id)}
								<li>
									<a
										href="/maintenance?ticket={h.id}"
										class="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50"
									>
										<StatusBadge status={h.status} />
										<span class="min-w-0 flex-1 truncate">#{h.number} {h.title}</span>
										{#if h.costAmount != null}<span class="text-xs tabular-nums"
												>{formatMoney(h.costAmount)}</span
											>{/if}
										<span class="text-xs text-muted-foreground">{formatRelative(h.createdAt)}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<TicketForm
	bind:open={addingWork}
	propertyId={detail?.property?.id ?? null}
	unitId={detail?.unit?.id ?? null}
	assetId={detail?.id ?? null}
/>

<Modal.Root open={dialogOpen} onOpenChange={setDialog}>
	<Modal.Content class="sm:max-w-xl">
		<form onsubmit={submit} class="space-y-5">
			<Modal.Header><Modal.Title>{editing ? 'Edit asset' : 'New asset'}</Modal.Title></Modal.Header>
			<Field.Group class="gap-4">
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="as-name">Name</Field.Label>
						<Input id="as-name" placeholder="Rooftop HVAC unit" required bind:value={fName} />
					</Field.Field>
					<Field.Field>
						<Field.Label>Kind</Field.Label>
						<Select.Root type="single" bind:value={fKind}>
							<Select.Trigger class="w-full">{KIND_LABEL[fKind]}</Select.Trigger>
							<Select.Content class="max-h-72"
								>{#each assetKinds as k (k)}<Select.Item value={k}>{KIND_LABEL[k]}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label>Property</Field.Label>
						<Select.Root
							type="single"
							bind:value={fProperty}
							onValueChange={() => (fUnit = '')}
							disabled={!!editing}
						>
							<Select.Trigger class="w-full"
								>{selName(properties, fProperty) ?? 'Select'}</Select.Trigger
							>
							<Select.Content class="max-h-72"
								>{#each properties as p (p.id)}<Select.Item value={p.id}>{p.name}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label>Unit</Field.Label>
						<Select.Root type="single" bind:value={fUnit} disabled={!fProperty}>
							<Select.Trigger class="w-full"
								>{selName(propUnits, fUnit) ?? 'Common area'}</Select.Trigger
							>
							<Select.Content class="max-h-72">
								<Select.Item value="">Common area</Select.Item>
								{#each propUnits as u (u.id)}<Select.Item value={u.id}>{u.name}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<Field.Field>
						<Field.Label for="as-make">Make</Field.Label>
						<Input id="as-make" bind:value={fMake} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="as-model">Model</Field.Label>
						<Input id="as-model" bind:value={fModel} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="as-serial">Serial</Field.Label>
						<Input id="as-serial" bind:value={fSerial} />
					</Field.Field>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<Field.Field>
						<Field.Label for="as-installed">Installed</Field.Label>
						<Input id="as-installed" type="date" bind:value={fInstalled} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="as-warranty">Warranty until</Field.Label>
						<Input id="as-warranty" type="date" bind:value={fWarranty} />
					</Field.Field>
					<Field.Field>
						<Field.Label>Service vendor</Field.Label>
						<Select.Root type="single" bind:value={fVendor}>
							<Select.Trigger class="w-full">{selName(vendors, fVendor) ?? 'None'}</Select.Trigger>
							<Select.Content class="max-h-72">
								<Select.Item value="">None</Select.Item>
								{#each vendors as v (v.id)}<Select.Item value={v.id}>{v.name}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				<Field.Field>
					<Field.Label for="as-notes">Notes</Field.Label>
					<Textarea id="as-notes" rows={3} bind:value={fNotes} />
				</Field.Field>
			</Field.Group>
			<Modal.Footer>
				<Button type="button" variant="ghost" onclick={() => setDialog(false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !fName.trim() || !fProperty}
					>{pending ? 'Saving…' : editing ? 'Save' : 'Add asset'}</Button
				>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
