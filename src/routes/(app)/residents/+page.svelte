<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { toast } from 'svelte-sonner';
	import { addDays, formatDate, formatRelative, todayISO } from '#lib/format.ts';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import { getProperties, getUnits, getTenants } from '#lib/remote/portfolio.remote.ts';
	import {
		bookSlot,
		cancelBooking,
		createAmenity,
		deleteAmenity,
		getAmenities,
		getBookings,
		getPackages,
		logPackage,
		markPickedUp
	} from '#lib/remote/residents.remote.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import Armchair from '@lucide/svelte/icons/armchair';
	import Bell from '@lucide/svelte/icons/bell';
	import PermitsView from '#lib/components/app/permits-view.svelte';
	import KeysView from '#lib/components/app/keys-view.svelte';
	import PassesView from '#lib/components/app/passes-view.svelte';

	const isAdmin = $derived(page.data.role !== 'member');
	let restab = $state('packages');
	const properties = $derived(await getProperties());
	const units = $derived(await getUnits());
	const tenants = $derived(await getTenants());
	const tenantName = (t: { firstName: string; lastName: string; companyName: string | null }) =>
		`${t.firstName} ${t.lastName}`.trim() || t.companyName || 'Resident';

	// ---------- Packages ----------
	let showPickedUp = $state(false);
	const packages = $derived(await getPackages(showPickedUp));
	let loggingPackage = $state(false);
	let pkgProperty = $state('');
	let pkgUnit = $state('');
	let pkgTenant = $state('');
	let pkgCarrier = $state('');
	let pkgTracking = $state('');
	let pkgDesc = $state('');
	const pkgUnits = $derived(units.filter((u) => u.propertyId === pkgProperty));

	async function savePackage(e: SubmitEvent) {
		e.preventDefault();
		if (!pkgProperty) return;
		try {
			await logPackage({
				propertyId: pkgProperty,
				unitId: pkgUnit || null,
				tenantId: pkgTenant || null,
				carrier: pkgCarrier.trim() || null,
				tracking: pkgTracking.trim() || null,
				description: pkgDesc.trim() || null
			});
			toast.success('Package logged');
			loggingPackage = false;
			pkgUnit = pkgTenant = pkgCarrier = pkgTracking = pkgDesc = '';
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not log package'
			);
		}
	}

	// ---------- Amenities ----------
	const amenities = $derived(await getAmenities());
	let amenityId = $state('');
	const amenity = $derived(amenities.find((a) => a.id === amenityId) ?? amenities[0]);
	$effect(() => {
		if (!amenityId && amenities.length) amenityId = amenities[0]!.id;
	});
	let day = $state(todayISO());
	// Mid-typing the native date input yields a partial value → Invalid Date; fall back to today.
	const dayStart = $derived.by(() => {
		const d = new Date(`${day}T00:00:00`);
		return Number.isNaN(d.getTime()) ? new Date(`${todayISO()}T00:00:00`) : d;
	});
	const dayEnd = $derived(new Date(dayStart.getTime() + 86_400_000));
	const bookings = $derived(
		amenity
			? await getBookings({ amenityId: amenity.id, from: dayStart.toISOString(), days: 7 })
			: []
	);
	const dayBookings = $derived(
		bookings.filter(
			(b) =>
				b.status === 'confirmed' && new Date(b.startsAt) < dayEnd && new Date(b.endsAt) > dayStart
		)
	);
	const upcoming = $derived(
		bookings.filter((b) => b.status === 'confirmed' && new Date(b.endsAt) > new Date())
	);

	const slots = $derived.by(() => {
		if (!amenity) return [];
		const out: { start: Date; label: string; takenBy: string | null }[] = [];
		for (
			let m = amenity.openHour * 60;
			m + amenity.slotMinutes <= amenity.closeHour * 60;
			m += amenity.slotMinutes
		) {
			const start = new Date(dayStart.getTime() + m * 60_000);
			const end = new Date(start.getTime() + amenity.slotMinutes * 60_000);
			const hit = dayBookings.find((b) => new Date(b.startsAt) < end && new Date(b.endsAt) > start);
			out.push({
				start,
				label: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
				takenBy: hit
					? `${hit.tenantFirst} ${hit.tenantLast}`.trim() || hit.tenantCompany || 'Booked'
					: null
			});
		}
		return out;
	});

	let bookingSlot = $state<Date | null>(null);
	let bookingTenant = $state('');
	let bookingNotes = $state('');

	const refreshBookings = () => {
		if (amenity)
			void getBookings({ amenityId: amenity.id, from: dayStart.toISOString(), days: 7 }).refresh();
	};

	async function confirmBooking() {
		if (!amenity || !bookingSlot) return;
		try {
			await bookSlot({
				amenityId: amenity.id,
				tenantId: bookingTenant || null,
				startsAt: bookingSlot.toISOString(),
				notes: bookingNotes.trim() || null
			});
			toast.success('Booked');
			bookingSlot = null;
			bookingTenant = bookingNotes = '';
			refreshBookings();
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not book');
		}
	}

	async function cancel(id: string) {
		await cancelBooking(id);
		refreshBookings();
		toast.success('Booking cancelled');
	}

	// Amenity form
	let addingAmenity = $state(false);
	let aProperty = $state('');
	let aName = $state('');
	let aDesc = $state('');
	let aOpen = $state(8);
	let aClose = $state(21);
	let aSlot = $state(120);
	let aAhead = $state(14);

	async function saveAmenity(e: SubmitEvent) {
		e.preventDefault();
		try {
			const { id } = await createAmenity({
				propertyId: aProperty,
				name: aName.trim(),
				description: aDesc.trim() || null,
				openHour: aOpen,
				closeHour: aClose,
				slotMinutes: aSlot,
				maxDaysAhead: aAhead
			});
			amenityId = id;
			addingAmenity = false;
			aName = aDesc = '';
			toast.success('Amenity added');
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not add amenity'
			);
		}
	}
</script>

<PageHeader title="Residents">
	{#snippet actions()}
		<Button size="sm" onclick={() => (loggingPackage = true)}
			><Plus /> <span class="hidden sm:inline">Log package</span></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	<Tabs.Root bind:value={restab}>
		<Tabs.List>
			<Tabs.Trigger value="packages">Packages</Tabs.Trigger>
			<Tabs.Trigger value="amenities">Amenities</Tabs.Trigger>
			<Tabs.Trigger value="parking">Parking</Tabs.Trigger>
			<Tabs.Trigger value="keys">Keys & fobs</Tabs.Trigger>
			<Tabs.Trigger value="guests">Guests</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="packages" class="mt-4 space-y-4">
			<div class="flex items-center gap-3">
				<label class="flex items-center gap-2 text-sm text-muted-foreground"
					><input type="checkbox" bind:checked={showPickedUp} class="accent-primary" /> Show picked up</label
				>
			</div>
			<div class="overflow-hidden rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Received</Table.Head>
							<Table.Head>Resident</Table.Head>
							<Table.Head class="hidden md:table-cell">Location</Table.Head>
							<Table.Head class="hidden sm:table-cell">Carrier</Table.Head>
							<Table.Head class="hidden lg:table-cell">Notes</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head class="w-24"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each packages as p (p.id)}
							<Table.Row>
								<Table.Cell class="text-sm text-muted-foreground"
									>{formatRelative(p.createdAt)}</Table.Cell
								>
								<Table.Cell class="font-medium"
									>{p.tenantId
										? `${p.tenantFirst} ${p.tenantLast}`.trim() || p.tenantCompany
										: 'Front desk'}{#if p.notifiedAt}
										<Bell class="ml-1 inline size-3 text-muted-foreground" />{/if}</Table.Cell
								>
								<Table.Cell class="hidden text-muted-foreground md:table-cell"
									>{p.propertyName}{p.unitName ? ` · ${p.unitName}` : ''}</Table.Cell
								>
								<Table.Cell class="hidden text-muted-foreground sm:table-cell"
									>{p.carrier ?? '—'}{#if p.tracking}
										<span class="block text-xs tabular-nums">{p.tracking}</span>{/if}</Table.Cell
								>
								<Table.Cell class="hidden max-w-48 truncate text-muted-foreground lg:table-cell"
									>{p.description ?? '—'}</Table.Cell
								>
								<Table.Cell
									>{#if p.status === 'picked_up'}
										<Badge variant="secondary">Picked up</Badge>
									{:else}
										<Badge>Awaiting pickup</Badge>
									{/if}</Table.Cell
								>
								<Table.Cell class="text-right">
									{#if p.status === 'awaiting_pickup'}
										<Button size="sm" variant="outline" onclick={() => markPickedUp(p.id)}
											><CheckCheck /> Picked up</Button
										>
									{:else if p.pickedUpAt}
										<span class="text-xs text-muted-foreground">{formatRelative(p.pickedUpAt)}</span
										>
									{/if}
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row
								><Table.Cell colspan={7} class="py-8 text-center text-muted-foreground"
									>No packages waiting.</Table.Cell
								></Table.Row
							>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</Tabs.Content>

		<Tabs.Content value="amenities" class="mt-4">
			{#if amenities.length === 0}
				<Empty.Root class="border">
					<Empty.Header>
						<Empty.Media variant="icon"><Armchair /></Empty.Media>
						<Empty.Title>No amenities yet</Empty.Title>
						<Empty.Description
							>Add a clubhouse, gym or rooftop residents can book, then take bookings here.</Empty.Description
						>
					</Empty.Header>
					{#if isAdmin}
						<Empty.Content
							><Button onclick={() => (addingAmenity = true)}><Plus /> Add amenity</Button
							></Empty.Content
						>
					{/if}
				</Empty.Root>
			{:else}
				<div class="grid gap-4 md:grid-cols-[16rem_1fr]">
					<div class="space-y-2">
						{#each amenities as a (a.id)}
							<button
								type="button"
								onclick={() => (amenityId = a.id)}
								class="w-full rounded-lg border p-3 text-left transition {amenity?.id === a.id
									? 'border-foreground/30 bg-muted/50'
									: 'hover:bg-muted/40'}"
							>
								<div class="flex items-center gap-2">
									<span class="flex-1 truncate text-sm font-medium">{a.name}</span>
									{#if isAdmin}
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label="Delete {a.name}"
											onclick={(e) => {
												e.stopPropagation();
												confirmDelete({
													title: `Delete ${a.name}?`,
													description: 'Its bookings are removed too.',
													onConfirm: async () => {
														await deleteAmenity(a.id).catch(() => toast.error('Could not delete'));
													}
												});
											}}><Trash2 class="size-4 text-muted-foreground" /></Button
										>
									{/if}
								</div>
								<span class="block truncate text-xs text-muted-foreground"
									>{a.propertyName} · {a.openHour}:00–{a.closeHour}:00</span
								>
							</button>
						{/each}
						{#if isAdmin}
							<Button
								variant="outline"
								size="sm"
								class="w-full border-dashed"
								onclick={() => (addingAmenity = true)}><Plus /> Add amenity</Button
							>
						{/if}
					</div>

					{#if amenity}
						<div class="space-y-4">
							<Card.Root>
								<Card.Header class="pb-3">
									<div class="flex flex-wrap items-center gap-3">
										<div>
											<Card.Title>{amenity.name}</Card.Title>
											<Card.Description
												>{amenity.propertyName} · {amenity.openHour}:00–{amenity.closeHour}:00 ·
												{amenity.slotMinutes} min slots</Card.Description
											>
										</div>
										<Input
											type="date"
											class="ml-auto h-8 w-40"
											bind:value={day}
											min={todayISO()}
											max={addDays(todayISO(), amenity.maxDaysAhead)}
											aria-label="Booking date"
										/>
									</div>
								</Card.Header>
								<Card.Content>
									<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
										{#each slots as s (s.start.toISOString())}
											{#if s.takenBy}
												<div
													class="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
												>
													<span class="tabular-nums">{s.label}</span>
													<span class="block truncate text-xs">Booked · {s.takenBy}</span>
												</div>
											{:else}
												<Button
													variant="outline"
													class="justify-start tabular-nums"
													onclick={() => (bookingSlot = s.start)}>{s.label}</Button
												>
											{/if}
										{/each}
									</div>
								</Card.Content>
							</Card.Root>

							{#if upcoming.length}
								<div class="space-y-2">
									<h3 class="text-sm font-medium">Upcoming bookings</h3>
									{#each upcoming as b (b.id)}
										<div class="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
											<span class="tabular-nums"
												>{formatDate(b.startsAt)}
												{new Date(b.startsAt).toLocaleTimeString('en-US', {
													hour: 'numeric',
													minute: '2-digit'
												})}</span
											>
											<span class="truncate"
												>{`${b.tenantFirst} ${b.tenantLast}`.trim() ||
													b.tenantCompany ||
													'Resident'}</span
											>
											<Button variant="ghost" size="sm" class="ml-auto" onclick={() => cancel(b.id)}
												>Cancel</Button
											>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="parking"><PermitsView /></Tabs.Content>
		<Tabs.Content value="keys"><KeysView /></Tabs.Content>
		<Tabs.Content value="guests"><PassesView /></Tabs.Content>
	</Tabs.Root>
</main>

<Modal.Root bind:open={loggingPackage}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={savePackage}>
			<Modal.Header>
				<Modal.Title>Log a package</Modal.Title>
				<Modal.Description>Record a delivery waiting at the office.</Modal.Description>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Property</Field.Label>
				<NativeSelect.Root bind:value={pkgProperty} onchange={() => (pkgUnit = '')} class="w-full">
					<NativeSelect.Option value="" disabled>Pick a property</NativeSelect.Option>
					{#each properties as p (p.id)}
						<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Unit</Field.Label>
					<NativeSelect.Root bind:value={pkgUnit} class="w-full" disabled={!pkgProperty}>
						<NativeSelect.Option value="">—</NativeSelect.Option>
						{#each pkgUnits as u (u.id)}
							<NativeSelect.Option value={u.id}>{u.name}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
				<Field.Field>
					<Field.Label>Resident</Field.Label>
					<NativeSelect.Root bind:value={pkgTenant} class="w-full">
						<NativeSelect.Option value="">—</NativeSelect.Option>
						{#each tenants as t (t.id)}
							<NativeSelect.Option value={t.id}>{tenantName(t)}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Carrier</Field.Label>
					<Input bind:value={pkgCarrier} placeholder="UPS, USPS…" />
				</Field.Field>
				<Field.Field>
					<Field.Label>Tracking #</Field.Label>
					<Input bind:value={pkgTracking} />
				</Field.Field>
			</div>
			<Field.Field>
				<Field.Label>Notes</Field.Label>
				<Input bind:value={pkgDesc} placeholder="Box, envelope, perishable…" />
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (loggingPackage = false)}
					>Cancel</Button
				>
				<Button type="submit" disabled={!pkgProperty}>Log package</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<Modal.Root
	open={bookingSlot !== null}
	onOpenChange={(o) => {
		if (!o) {
			bookingSlot = null;
			bookingTenant = bookingNotes = '';
		}
	}}
>
	<Modal.Content class="sm:max-w-sm">
		<Modal.Header>
			<Modal.Title
				>Book {amenity?.name} · {bookingSlot?.toLocaleTimeString('en-US', {
					hour: 'numeric',
					minute: '2-digit'
				})}</Modal.Title
			>
			<Modal.Description
				>{formatDate(bookingSlot)} · {amenity?.slotMinutes} minutes</Modal.Description
			>
		</Modal.Header>
		<div class="space-y-3">
			<Field.Field>
				<Field.Label>Resident</Field.Label>
				<NativeSelect.Root bind:value={bookingTenant} class="w-full">
					<NativeSelect.Option value="">Unassigned</NativeSelect.Option>
					{#each tenants as t (t.id)}
						<NativeSelect.Option value={t.id}>{tenantName(t)}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Notes</Field.Label>
				<Textarea bind:value={bookingNotes} rows={2} />
			</Field.Field>
		</div>
		<Modal.Footer>
			<Button
				variant="outline"
				onclick={() => {
					bookingSlot = null;
					bookingTenant = bookingNotes = '';
				}}>Cancel</Button
			>
			<Button onclick={confirmBooking}>Book</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>

<Modal.Root bind:open={addingAmenity}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={saveAmenity}>
			<Modal.Header>
				<Modal.Title>Add an amenity</Modal.Title>
				<Modal.Description>Residents and staff can book it in time slots.</Modal.Description>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Property</Field.Label>
				<NativeSelect.Root bind:value={aProperty} class="w-full">
					<NativeSelect.Option value="" disabled>Pick a property</NativeSelect.Option>
					{#each properties as p (p.id)}
						<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Name</Field.Label>
				<Input bind:value={aName} placeholder="Clubhouse, gym, rooftop…" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Description</Field.Label>
				<Input bind:value={aDesc} placeholder="Optional" />
			</Field.Field>
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
				<Field.Field>
					<Field.Label>Opens</Field.Label>
					<Input type="number" min="0" max="23" bind:value={aOpen} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Closes</Field.Label>
					<Input type="number" min="1" max="24" bind:value={aClose} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Slot (min)</Field.Label>
					<Input type="number" min="15" max="720" step="15" bind:value={aSlot} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Days ahead</Field.Label>
					<Input type="number" min="1" max="365" bind:value={aAhead} />
				</Field.Field>
			</div>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (addingAmenity = false)}
					>Cancel</Button
				>
				<Button type="submit" disabled={!aProperty || !aName.trim()}>Add</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
