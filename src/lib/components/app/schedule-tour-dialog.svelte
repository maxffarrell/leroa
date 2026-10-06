<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import { getMembers } from '#lib/remote/workspace.remote.ts';
	import { getLeasingSettings, scheduleTour } from '#lib/remote/crm.remote.ts';
	import { TOUR_KIND_LABELS, TOUR_KINDS } from '#lib/leads.ts';
	import { addDays, todayISO } from '#lib/format.ts';
	import { zonedToUtc } from '#lib/tours.ts';

	type Props = {
		open?: boolean;
		leadId: string;
		leadName: string;
		propertyId?: string | null;
		listingId?: string | null;
	};
	let { open = $bindable(false), leadId, leadName, propertyId, listingId }: Props = $props();

	const properties = $derived(open ? await getProperties() : []);
	const members = $derived(open ? await getMembers() : []);
	const settings = $derived(open ? await getLeasingSettings() : null);

	let date = $state(addDays(todayISO(), 1));
	let time = $state('10:00');
	let duration = $state('30');
	let kind = $state<(typeof TOUR_KINDS)[number]>('in_person');
	let chosenProperty = $state<string | null>(null);
	let agentId = $state('');
	let notes = $state('');
	let pending = $state(false);
	const propId = $derived(chosenProperty ?? propertyId ?? '');
	const property = $derived(properties.find((p) => p.id === propId));
	const agent = $derived(members.find((m) => m.userId === agentId));

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!propId) return toast.error('Pick a property');
		const [h, m] = time.split(':').map(Number);
		pending = true;
		try {
			await scheduleTour({
				leadId,
				propertyId: propId,
				listingId: propId === propertyId ? (listingId ?? null) : null,
				startsAt: zonedToUtc(date, h! * 60 + m!, settings?.timezone ?? 'UTC').toISOString(),
				durationMinutes: Number(duration),
				kind,
				agentId: agentId || null,
				notes: notes || null
			});
			toast.success('Tour booked');
			open = false;
			notes = '';
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not book tour');
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>Book a tour</Dialog.Title>
				<Dialog.Description
					>With {leadName}. Times are in {settings?.timezone ?? 'UTC'}.</Dialog.Description
				>
			</Dialog.Header>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field class="sm:col-span-2">
					<Field.Label>Property</Field.Label>
					<Select.Root type="single" bind:value={() => propId, (v) => (chosenProperty = v)}>
						<Select.Trigger class="w-full">{property?.name ?? 'Select a property'}</Select.Trigger>
						<Select.Content class="max-h-72">
							{#each properties as p (p.id)}
								<Select.Item value={p.id} label={p.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label for="st-date">Date</Field.Label>
					<Input id="st-date" type="date" required bind:value={date} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="st-time">Time</Field.Label>
					<Input id="st-time" type="time" step={900} required bind:value={time} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Type</Field.Label>
					<Select.Root type="single" bind:value={kind}>
						<Select.Trigger class="w-full">{TOUR_KIND_LABELS[kind]}</Select.Trigger>
						<Select.Content>
							{#each TOUR_KINDS as k (k)}
								<Select.Item value={k} label={TOUR_KIND_LABELS[k]} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label>Length</Field.Label>
					<Select.Root type="single" bind:value={duration}>
						<Select.Trigger class="w-full">{duration} min</Select.Trigger>
						<Select.Content>
							{#each ['15', '30', '45', '60'] as d (d)}
								<Select.Item value={d} label="{d} min" />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field class="sm:col-span-2">
					<Field.Label>Shown by</Field.Label>
					<Select.Root type="single" bind:value={agentId}>
						<Select.Trigger class="w-full">{agent?.name ?? 'Me'}</Select.Trigger>
						<Select.Content>
							<Select.Item value="" label="Me" />
							{#each members as m (m.userId)}
								<Select.Item value={m.userId} label={m.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Field>
				<Field.Field class="sm:col-span-2">
					<Field.Label for="st-notes">Notes</Field.Label>
					<Textarea id="st-notes" rows={2} bind:value={notes} />
				</Field.Field>
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={pending || !propId}>Book tour</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
