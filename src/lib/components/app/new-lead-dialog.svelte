<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import { createLead } from '#lib/remote/crm.remote.ts';
	import { LEAD_SOURCE_LABELS, LEAD_SOURCES, type LeadSource } from '#lib/leads.ts';
	import { todayISO } from '#lib/format.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const properties = $derived(open ? await getProperties() : []);
	const sources = LEAD_SOURCES.filter((s) => s !== 'application' && s !== 'api');

	const blank = () => ({
		firstName: '',
		lastName: '',
		email: '',
		phone: '',
		source: 'phone' as LeadSource,
		propertyId: '',
		moveInDate: '',
		bedrooms: '',
		budgetMax: null as number | null,
		nextFollowUpOn: todayISO(),
		waitlist: false
	});
	let form = $state(blank());
	let pending = $state(false);
	const property = $derived(properties.find((p) => p.id === form.propertyId));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			const { id, existing } = await createLead({
				...form,
				email: form.email || null,
				phone: form.phone || null,
				propertyId: form.propertyId || null,
				moveInDate: form.moveInDate || null,
				bedrooms: form.bedrooms === '' ? null : Number(form.bedrooms),
				nextFollowUpOn: form.nextFollowUpOn || null
			});
			if (existing) toast.info('Already a lead. Added the new details to their record.');
			open = false;
			form = blank();
			await goto(`/leasing/leads/${id}`);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not add lead');
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>New lead</Dialog.Title>
				<Dialog.Description>Someone who called, walked in or was referred.</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label for="nl-first">First name</Field.Label>
					<Input id="nl-first" required bind:value={form.firstName} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="nl-last">Last name</Field.Label>
					<Input id="nl-last" bind:value={form.lastName} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="nl-email">Email</Field.Label>
					<Input id="nl-email" type="email" bind:value={form.email} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="nl-phone">Phone</Field.Label>
					<Input id="nl-phone" type="tel" bind:value={form.phone} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Source</Field.Label>
					<Select.Root type="single" bind:value={form.source}>
						<Select.Trigger class="w-full">{LEAD_SOURCE_LABELS[form.source]}</Select.Trigger>
						<Select.Content>
							{#each sources as s (s)}
								<Select.Item value={s} label={LEAD_SOURCE_LABELS[s]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label>Interested in</Field.Label>
					<Select.Root type="single" bind:value={form.propertyId}>
						<Select.Trigger class="w-full">{property?.name ?? 'Any property'}</Select.Trigger>
						<Select.Content class="max-h-72">
							<Select.Item value="" label="Any property" />
							{#each properties as p (p.id)}
								<Select.Item value={p.id} label={p.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label for="nl-move">Move-in</Field.Label>
					<Input id="nl-move" type="date" bind:value={form.moveInDate} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="nl-beds">Bedrooms (min)</Field.Label>
					<Input
						id="nl-beds"
						type="number"
						inputmode="numeric"
						min={0}
						max={20}
						bind:value={form.bedrooms}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="nl-budget">Budget / mo</Field.Label>
					<MoneyInput id="nl-budget" bind:value={form.budgetMax} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="nl-follow">Follow up on</Field.Label>
					<Input id="nl-follow" type="date" bind:value={form.nextFollowUpOn} />
				</Field.Field>
			</div>
			<Field.Field orientation="horizontal">
				<Checkbox id="nl-wait" bind:checked={form.waitlist} />
				<Field.Label for="nl-wait" class="font-normal"
					>Add to the waitlist for a matching home</Field.Label
				>
			</Field.Field>
			<Dialog.Footer>
				<Button type="submit" disabled={pending || !form.firstName.trim()}>Add lead</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
