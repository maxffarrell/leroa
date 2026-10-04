<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { createProperty } from '#lib/remote/portfolio.remote.ts';
	import { propertyTypes } from '#lib/schemas.ts';
	import { expandUnits } from './units.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const typeLabels: Record<(typeof propertyTypes)[number], string> = {
		single_family: 'Single family',
		multi_family: 'Multi-family',
		condo: 'Condo',
		commercial: 'Commercial',
		mixed_use: 'Mixed use',
		other: 'Other'
	};

	let form = $state({
		name: '',
		type: 'multi_family' as (typeof propertyTypes)[number],
		addressLine1: '',
		city: '',
		region: '',
		postalCode: ''
	});
	let unitsText = $state('');
	let pending = $state(false);
	const units = $derived(expandUnits(unitsText));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			const p = await createProperty({
				...form,
				units: form.type === 'single_family' && !units.length ? ['Main'] : units
			});
			toast.success(`${p.name} added`);
			open = false;
			form = {
				name: '',
				type: 'multi_family',
				addressLine1: '',
				city: '',
				region: '',
				postalCode: ''
			};
			unitsText = '';
			await goto(`/properties/${p.id}`);
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not add property'
			);
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>New property</Dialog.Title>
				<Dialog.Description>Add a building and, optionally, its units in one go.</Dialog.Description
				>
			</Dialog.Header>
			<Field.Group class="gap-4">
				<div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
					<Field.Field>
						<Field.Label for="p-name">Name</Field.Label>
						<Input
							id="p-name"
							placeholder="Maple Court"
							required
							bind:value={form.name}
							autofocus
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label>Type</Field.Label>
						<Select.Root type="single" bind:value={form.type}>
							<Select.Trigger class="w-full">{typeLabels[form.type]}</Select.Trigger>
							<Select.Content>
								{#each propertyTypes as t (t)}<Select.Item value={t}>{typeLabels[t]}</Select.Item
									>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				<Field.Field>
					<Field.Label for="p-addr">Street address</Field.Label>
					<Input id="p-addr" autocomplete="address-line1" bind:value={form.addressLine1} />
				</Field.Field>
				<div class="grid grid-cols-[1fr_5rem_6rem] gap-3">
					<Field.Field
						><Field.Label for="p-city">City</Field.Label><Input
							id="p-city"
							bind:value={form.city}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="p-region">State</Field.Label><Input
							id="p-region"
							bind:value={form.region}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="p-zip">ZIP</Field.Label><Input
							id="p-zip"
							bind:value={form.postalCode}
						/></Field.Field
					>
				</div>
				{#if form.type !== 'single_family'}
					<Field.Field>
						<Field.Label for="p-units">Units</Field.Label>
						<Textarea
							id="p-units"
							rows={2}
							placeholder="101-112, 201-212, Penthouse"
							bind:value={unitsText}
						/>
						<Field.Description>
							{units.length
								? `${units.length} units: ${units.slice(0, 6).join(', ')}${units.length > 6 ? '…' : ''}`
								: 'Comma-separated. Ranges like 101-112 are expanded.'}
						</Field.Description>
					</Field.Field>
				{/if}
			</Field.Group>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add property'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
