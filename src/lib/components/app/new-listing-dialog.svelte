<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getUnits } from '#lib/remote/portfolio.remote.ts';
	import { createListing } from '#lib/remote/listings.remote.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const units = $derived(open ? await getUnits() : []);
	const sorted = $derived(
		[...units].sort((a, b) => Number(a.status !== 'vacant') - Number(b.status !== 'vacant'))
	);
	let unitId = $state('');
	let pending = $state(false);
	const selected = $derived(units.find((u) => u.id === unitId));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!unitId) return toast.error('Pick a unit');
		pending = true;
		try {
			const { id, existing } = await createListing({ unitId });
			if (existing) toast.info('This unit already has a listing');
			open = false;
			unitId = '';
			await goto(`/leasing/listings/${id}`);
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not create listing'
			);
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>New listing</Dialog.Title>
				<Dialog.Description
					>Starts as a draft with the unit's details. Publish it when it looks right.</Dialog.Description
				>
			</Dialog.Header>
			<Field.Field>
				<Field.Label>Unit</Field.Label>
				<Select.Root type="single" bind:value={unitId}>
					<Select.Trigger class="w-full"
						>{selected
							? `${selected.propertyName} · ${selected.name}`
							: 'Select a unit'}</Select.Trigger
					>
					<Select.Content class="max-h-72">
						{#each sorted as u (u.id)}
							<Select.Item value={u.id} label={`${u.propertyName} · ${u.name}`}>
								{u.propertyName} · {u.name}
								<span class="ml-auto text-xs text-muted-foreground capitalize">{u.status}</span>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</Field.Field>
			<Dialog.Footer>
				<Button type="submit" disabled={pending || !unitId}>Create draft</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
