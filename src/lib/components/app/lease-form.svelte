<script lang="ts">
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import MoneyInput from './money-input.svelte';
	import TenantForm from './tenant-form.svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getTenants, getUnits } from '#lib/remote/portfolio.remote.ts';
	import { createLease } from '#lib/remote/leasing.remote.ts';
	import { tenantName, todayISO } from '#lib/format.ts';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';

	type Props = {
		open?: boolean;
		unitId?: string | null;
		propertyId?: string | null;
		tenantId?: string | null;
	};
	let {
		open = $bindable(false),
		unitId = null,
		propertyId = null,
		tenantId = null
	}: Props = $props();

	const units = $derived(open ? await getUnits() : []);
	const tenants = $derived(open ? await getTenants() : []);
	const pickable = $derived(propertyId ? units.filter((u) => u.propertyId === propertyId) : units);

	const oneYear = () => {
		const now = new Date();
		return new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate() - 1))
			.toISOString()
			.slice(0, 10);
	};

	let unit = $state('');
	let tenantIds = $state<string[]>([]);
	let startDate = $state(todayISO());
	let endDate = $state(oneYear());
	let rentAmount = $state<number | null>(null);
	let depositAmount = $state<number | null>(null);
	let rentDueDay = $state(1);
	let lateFeeAmount = $state<number | null>(null);
	let lateFeeGraceDays = $state(5);
	let pending = $state(false);
	let addingTenant = $state(false);

	$effect(() => {
		if (open) {
			unit = unitId ?? '';
			tenantIds = tenantId ? [tenantId] : [];
		}
	});

	const selectedUnit = $derived(units.find((u) => u.id === unit));
	$effect(() => {
		if (selectedUnit?.marketRent && rentAmount == null) rentAmount = selectedUnit.marketRent;
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!unit) return toast.error('Pick a unit');
		if (!tenantIds.length) return toast.error('Add at least one tenant');
		if (!rentAmount) return toast.error('Enter the rent');
		pending = true;
		try {
			const l = await createLease({
				unitId: unit,
				tenantIds,
				startDate,
				endDate: endDate || null,
				rentAmount,
				depositAmount: depositAmount ?? 0,
				rentDueDay,
				lateFeeAmount: lateFeeAmount ?? 0,
				lateFeeGraceDays
			});
			toast.success('Lease created');
			open = false;
			await goto(`/leases/${l.id}`);
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not create lease'
			);
		} finally {
			pending = false;
		}
	}
</script>

<Modal.Root bind:open>
	<Modal.Content class="sm:max-w-lg">
		<form onsubmit={submit} class="space-y-5">
			<Modal.Header>
				<Modal.Title>New lease</Modal.Title>
				<Modal.Description>Rent charges are generated automatically each month.</Modal.Description>
			</Modal.Header>
			<Field.Group class="gap-4">
				<Field.Field>
					<Field.Label>Unit</Field.Label>
					<Select.Root type="single" bind:value={unit}>
						<Select.Trigger class="w-full"
							>{selectedUnit
								? `${selectedUnit.propertyName} · ${selectedUnit.name}`
								: 'Select a unit'}</Select.Trigger
						>
						<Select.Content class="max-h-72">
							{#each pickable as u (u.id)}
								<Select.Item value={u.id} label={`${u.propertyName} · ${u.name}`}>
									{u.propertyName} · {u.name}
									{#if u.status !== 'vacant'}<span
											class="ml-auto text-xs text-muted-foreground capitalize">{u.status}</span
										>{/if}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label>Tenants</Field.Label>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each tenantIds as tid (tid)}
							{@const t = tenants.find((x) => x.id === tid)}
							<Badge variant="secondary" class="gap-1 pr-1">
								{t ? tenantName(t) : '…'}
								<button
									type="button"
									class="rounded-sm hover:bg-muted-foreground/20"
									aria-label="Remove"
									onclick={() => (tenantIds = tenantIds.filter((x) => x !== tid))}
									><X class="size-3" /></button
								>
							</Badge>
						{/each}
						<Select.Root
							type="single"
							value=""
							onValueChange={(v) => v && !tenantIds.includes(v) && (tenantIds = [...tenantIds, v])}
						>
							<Select.Trigger size="sm" class="h-7">Add existing</Select.Trigger>
							<Select.Content class="max-h-72">
								{#each tenants.filter((t) => !tenantIds.includes(t.id)) as t (t.id)}
									<Select.Item value={t.id} label={tenantName(t)}>{tenantName(t)}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							class="h-7"
							onclick={() => (addingTenant = true)}><Plus /> New</Button
						>
					</div>
				</Field.Field>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field
						><Field.Label for="l-start">Start</Field.Label><Input
							id="l-start"
							type="date"
							required
							bind:value={startDate}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="l-end">End</Field.Label><Input
							id="l-end"
							type="date"
							bind:value={endDate}
						/><Field.Description>Blank for month-to-month.</Field.Description></Field.Field
					>
				</div>
				<div class="grid grid-cols-[1fr_1fr_6rem] gap-3">
					<Field.Field
						><Field.Label for="l-rent">Monthly rent</Field.Label><MoneyInput
							id="l-rent"
							required
							bind:value={rentAmount}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="l-dep">Deposit</Field.Label><MoneyInput
							id="l-dep"
							bind:value={depositAmount}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="l-due">Due day</Field.Label><Input
							id="l-due"
							type="number"
							min={1}
							max={28}
							bind:value={rentDueDay}
						/></Field.Field
					>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field
						><Field.Label for="l-late">Late fee</Field.Label><MoneyInput
							id="l-late"
							bind:value={lateFeeAmount}
						/><Field.Description>Optional flat fee.</Field.Description></Field.Field
					>
					<Field.Field
						><Field.Label for="l-grace">Grace days</Field.Label><Input
							id="l-grace"
							type="number"
							min={0}
							max={31}
							bind:value={lateFeeGraceDays}
						/></Field.Field
					>
				</div>
			</Field.Group>
			<Modal.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create lease'}</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<TenantForm bind:open={addingTenant} oncreated={(t) => (tenantIds = [...tenantIds, t.id])} />
