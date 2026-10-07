<script lang="ts">
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getUnits } from '#lib/remote/portfolio.remote.ts';
	import { createInspection } from '#lib/remote/inspections.remote.ts';
	import { KIND_LABEL, type InspectionKind } from '#lib/inspections.ts';
	import { todayISO } from '#lib/format.ts';

	let {
		open = $bindable(false),
		unitId = $bindable(''),
		kind = $bindable<InspectionKind>('move_in')
	}: { open?: boolean; unitId?: string; kind?: InspectionKind } = $props();

	const units = $derived(open ? await getUnits() : []);
	let scheduledFor = $state(todayISO());
	let pending = $state(false);
	const selected = $derived(units.find((u) => u.id === unitId));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!unitId) return toast.error('Pick a unit');
		pending = true;
		try {
			const i = await createInspection({ unitId, kind, scheduledFor: scheduledFor || null });
			open = false;
			await goto(`/inspections/${i.id}`);
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not start the inspection'
			);
		} finally {
			pending = false;
		}
	}
</script>

<Modal.Root bind:open>
	<Modal.Content class="sm:max-w-md">
		<form onsubmit={submit} class="space-y-5">
			<Modal.Header>
				<Modal.Title>New inspection</Modal.Title>
				<Modal.Description
					>Starts with a checklist sized to the unit. A move-out reuses the move-in checklist so you
					can compare room by room.</Modal.Description
				>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Unit</Field.Label>
				<Select.Root type="single" bind:value={unitId}>
					<Select.Trigger class="w-full"
						>{selected
							? `${selected.propertyName} · ${selected.name}`
							: 'Select a unit'}</Select.Trigger
					>
					<Select.Content class="max-h-72">
						{#each units as u (u.id)}
							<Select.Item value={u.id} label={`${u.propertyName} · ${u.name}`}>
								{u.propertyName} · {u.name}
								<span class="ml-auto text-xs text-muted-foreground capitalize">{u.status}</span>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Type</Field.Label>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					class="w-full"
					value={kind}
					onValueChange={(v) => v && (kind = v as InspectionKind)}
				>
					{#each Object.entries(KIND_LABEL) as [value, label] (value)}
						<ToggleGroup.Item {value} class="flex-1">{label}</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label for="insp-date">Date</Field.Label>
				<Input id="insp-date" type="date" bind:value={scheduledFor} />
			</Field.Field>
			<Modal.Footer>
				<Button type="submit" disabled={pending || !unitId}
					>{pending ? 'Starting…' : 'Start inspection'}</Button
				>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
