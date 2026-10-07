<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { toast } from 'svelte-sonner';
	import { formatDate } from '#lib/format.ts';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import { cancelEvent, createEvent, getEvents } from '#lib/remote/residents.remote.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';

	const properties = $derived(await getProperties());
	let showCancelled = $state(false);
	const events = $derived(await getEvents(showCancelled));

	const time = (d: string | Date) =>
		new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	const past = (e: { startsAt: string | Date; status: string }) =>
		e.status === 'scheduled' && new Date(e.startsAt).getTime() + 86_400_000 < Date.now();

	let creating = $state(false);
	let fProperty = $state('');
	let fTitle = $state('');
	let fLocation = $state('');
	let fStart = $state('');
	let fEnd = $state('');
	let fCapacity = $state('');
	let fDesc = $state('');

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!fProperty || !fTitle.trim() || !fStart) return;
		try {
			await createEvent({
				propertyId: fProperty,
				title: fTitle.trim(),
				description: fDesc.trim() || null,
				location: fLocation.trim() || null,
				startsAt: new Date(fStart).toISOString(),
				endsAt: fEnd ? new Date(fEnd).toISOString() : null,
				capacity: fCapacity ? Number(fCapacity) : null
			});
			toast.success('Event scheduled');
			creating = false;
			fTitle = fLocation = fStart = fEnd = fCapacity = fDesc = '';
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not create event'
			);
		}
	}
</script>

<div class="mt-4 space-y-4">
	<div class="flex items-center gap-3">
		<Button size="sm" onclick={() => (creating = true)}><Plus /> New event</Button>
		<label class="flex items-center gap-2 text-sm text-muted-foreground"
			><input type="checkbox" bind:checked={showCancelled} class="accent-primary" /> Show cancelled</label
		>
	</div>
	<div class="space-y-2">
		{#each events as ev (ev.id)}
			<div
				class="flex items-start gap-3 rounded-lg border p-3 {ev.status === 'cancelled'
					? 'opacity-60'
					: ''}"
			>
				<div
					class="flex size-10 shrink-0 flex-col items-center justify-center rounded-md bg-muted text-center"
				>
					<span class="text-sm leading-none font-semibold tabular-nums"
						>{new Date(ev.startsAt).getDate()}</span
					>
					<span class="text-[10px] text-muted-foreground uppercase"
						>{new Date(ev.startsAt).toLocaleString('en-US', { month: 'short' })}</span
					>
				</div>
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<span class="truncate text-sm font-medium">{ev.title}</span>
						{#if ev.status === 'cancelled'}
							<Badge variant="secondary">Cancelled</Badge>
						{:else if past(ev)}
							<Badge variant="outline">Past</Badge>
						{/if}
					</div>
					<p class="mt-0.5 text-xs text-muted-foreground">
						<CalendarDays class="mr-0.5 inline size-3" />{formatDate(ev.startsAt, true)}
						{time(ev.startsAt)}{ev.endsAt ? `–${time(ev.endsAt)}` : ''}
						· {ev.propertyName}{#if ev.location}
							· <MapPin class="inline size-3" />{ev.location}{/if}{#if ev.capacity}
							· cap {ev.capacity}{/if}
					</p>
					{#if ev.description}
						<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{ev.description}</p>
					{/if}
				</div>
				{#if ev.status === 'scheduled'}
					<Button
						variant="ghost"
						size="sm"
						class="shrink-0 text-muted-foreground"
						onclick={() =>
							confirmDelete({
								title: `Cancel ${ev.title}?`,
								description: 'The event stays on the log as cancelled.',
								onConfirm: async () => {
									await cancelEvent(ev.id).catch(() => toast.error('Could not cancel'));
								}
							})}>Cancel</Button
					>
				{/if}
			</div>
		{:else}
			<div class="rounded-lg border py-10 text-center text-sm text-muted-foreground">
				No upcoming events.
			</div>
		{/each}
	</div>
</div>

<Modal.Root bind:open={creating}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={save}>
			<Modal.Header>
				<Modal.Title>New community event</Modal.Title>
				<Modal.Description>Something residents can attend at a property.</Modal.Description>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Title</Field.Label>
				<Input bind:value={fTitle} placeholder="Pool party, yard sale, movie night…" />
			</Field.Field>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Property</Field.Label>
					<NativeSelect.Root bind:value={fProperty} class="w-full">
						<NativeSelect.Option value="" disabled>Pick a property</NativeSelect.Option>
						{#each properties as p (p.id)}
							<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label>Location</Field.Label>
					<Input bind:value={fLocation} placeholder="Courtyard" />
				</Field.Field>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Starts</Field.Label>
					<Input type="datetime-local" bind:value={fStart} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Ends</Field.Label>
					<Input type="datetime-local" bind:value={fEnd} min={fStart} />
				</Field.Field>
			</div>
			<Field.Field>
				<Field.Label>Capacity</Field.Label>
				<Input type="number" bind:value={fCapacity} min="1" placeholder="Optional" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Description</Field.Label>
				<Textarea bind:value={fDesc} rows={3} placeholder="Details, what to bring…" />
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (creating = false)}>Cancel</Button>
				<Button type="submit" disabled={!fProperty || !fTitle.trim() || !fStart}>Schedule</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
