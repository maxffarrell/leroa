<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import {
		deleteListing,
		getListing,
		getListings,
		removeListingPhoto,
		setListingStatus,
		updateListing
	} from '#lib/remote/listings.remote.ts';
	import { AMENITY_SUGGESTIONS, unitFacts } from '#lib/listings.ts';
	import { toast } from 'svelte-sonner';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Link from '@lucide/svelte/icons/link';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';

	type Listing = Awaited<ReturnType<typeof getListing>>;
	let { listing }: { listing: Listing } = $props();

	const initial = untrack(() => listing);
	let title = $state(initial.title);
	let description = $state(initial.description);
	let rentAmount = $state<number | null>(initial.rentAmount);
	let depositAmount = $state<number | null>(initial.depositAmount);
	let availableOn = $state(initial.availableOn ?? '');
	let leaseTermMonths = $state<number | null>(initial.leaseTermMonths);
	let petPolicy = $state(initial.petPolicy ?? '');
	let amenities = $state<string[]>([...initial.amenities]);
	let customAmenity = $state('');
	let saving = $state(false);
	let uploading = $state(false);
	let dirty = $state(false);

	const publicUrl = $derived(`/l/${page.data.org?.slug}/${listing.id}`);
	const facts = $derived(unitFacts(listing));
	const demo = $derived(!!page.data.demo);
	const suggestions = $derived([...new Set([...AMENITY_SUGGESTIONS, ...amenities])]);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	function toggleAmenity(a: string) {
		amenities = amenities.includes(a) ? amenities.filter((x) => x !== a) : [...amenities, a];
		dirty = true;
	}

	function addCustom(e: SubmitEvent | KeyboardEvent) {
		e.preventDefault();
		const a = customAmenity.trim();
		if (a && !amenities.includes(a)) amenities = [...amenities, a];
		customAmenity = '';
		dirty = true;
	}

	async function save(e?: SubmitEvent) {
		e?.preventDefault();
		saving = true;
		try {
			await updateListing({
				id: listing.id,
				title,
				description,
				rentAmount: rentAmount ?? 0,
				depositAmount: depositAmount ?? 0,
				availableOn: availableOn || null,
				leaseTermMonths: leaseTermMonths || null,
				petPolicy: petPolicy || null,
				amenities
			});
			dirty = false;
			return true;
		} catch (err) {
			fail(err, 'Could not save');
			return false;
		} finally {
			saving = false;
		}
	}

	async function setStatus(status: 'draft' | 'published' | 'closed') {
		if (dirty && !(await save())) return;
		try {
			await setListingStatus({ id: listing.id, status });
			toast.success(
				status === 'published'
					? 'Listing is live'
					: status === 'closed'
						? 'Listing closed'
						: 'Listing moved back to draft'
			);
		} catch (err) {
			fail(err, 'Could not update the listing');
		}
	}

	async function upload(files: FileList | null) {
		const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (!images.length) return;
		uploading = true;
		try {
			const body = new FormData();
			for (const f of images) body.append('file', f);
			body.set('entityType', 'listing');
			body.set('entityId', listing.id);
			const res = await fetch('/api/documents', { method: 'POST', body });
			if (!res.ok) {
				const msg = (await res.json().catch(() => null))?.message;
				toast.error(msg ?? 'Upload failed');
			}
			await getListing(listing.id).refresh();
			void getListings().refresh();
		} finally {
			uploading = false;
		}
	}

	async function removePhoto(photoId: string) {
		await removeListingPhoto({ listingId: listing.id, photoId }).catch((err) =>
			fail(err, 'Could not remove photo')
		);
	}

	async function copyLink() {
		await navigator.clipboard.writeText(`${page.url.origin}${publicUrl}`);
		toast.success('Link copied');
	}

	async function remove() {
		if (!confirm('Delete this listing and its photos? Applications are kept.')) return;
		try {
			await deleteListing(listing.id);
			await goto('/leasing?tab=listings');
		} catch (err) {
			fail(err, 'Could not delete');
		}
	}
</script>

<svelte:window
	onbeforeunload={(e) => {
		if (dirty) e.preventDefault();
	}}
/>

<PageHeader title={listing.title} crumbs={[{ label: 'Leasing', href: '/leasing?tab=listings' }]}>
	{#snippet actions()}
		<Button size="sm" variant="outline" href={publicUrl} target="_blank"
			><ExternalLink />
			<span class="hidden sm:inline">{listing.status === 'published' ? 'View' : 'Preview'}</span
			></Button
		>
		{#if listing.status === 'published'}
			<Button size="sm" variant="outline" onclick={() => setStatus('closed')}>Close</Button>
		{:else}
			<Button size="sm" onclick={() => setStatus('published')}>Publish</Button>
		{/if}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}<Button
						size="icon-sm"
						variant="ghost"
						aria-label="More"
						{...props}><Ellipsis /></Button
					>{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Item onclick={copyLink}><Link /> Copy public link</DropdownMenu.Item>
				{#if listing.status !== 'draft'}
					<DropdownMenu.Item onclick={() => setStatus('draft')}
						>Move back to draft</DropdownMenu.Item
					>
				{/if}
				{#if page.data.role !== 'member'}
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" onclick={remove}
						>Delete listing</DropdownMenu.Item
					>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</PageHeader>

<main class="grid gap-6 p-4 md:p-6 lg:grid-cols-[1fr_18rem]">
	<form class="min-w-0 space-y-6" onsubmit={save} oninput={() => (dirty = true)}>
		<div class="flex flex-wrap items-center gap-2">
			<StatusBadge status={listing.status} />
			<span class="text-sm text-muted-foreground"
				>{listing.propertyName} · {listing.unitName}{facts ? ` · ${facts}` : ''}</span
			>
		</div>

		<Card.Root>
			<Card.Header>
				<Card.Title>Photos</Card.Title>
				<Card.Description
					>The first photo is the cover. JPEG, PNG or WebP up to 10 MB each.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
					{#each listing.photos as p, i (p.id)}
						<li class="group relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
							<img
								src="/api/documents/{p.id}"
								alt={p.name}
								loading="lazy"
								class="size-full object-cover"
							/>
							{#if i === 0}<span
									class="absolute bottom-1.5 left-1.5 rounded bg-background/90 px-1.5 text-xs font-medium"
									>Cover</span
								>{/if}
							<button
								type="button"
								class="absolute top-1.5 right-1.5 rounded-full bg-background/90 p-1 opacity-100 shadow-sm transition-opacity focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
								aria-label="Remove photo"
								onclick={() => removePhoto(p.id)}><X class="size-3.5" /></button
							>
						</li>
					{/each}
					<li>
						<label
							class="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
						>
							<ImagePlus class="size-5" />
							{uploading ? 'Uploading…' : demo ? 'Off in demo' : 'Add photos'}
							<input
								type="file"
								accept="image/*"
								multiple
								class="sr-only"
								disabled={uploading || demo}
								onchange={(e) => {
									void upload(e.currentTarget.files);
									e.currentTarget.value = '';
								}}
							/>
						</label>
					</li>
				</ul>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header><Card.Title>Details</Card.Title></Card.Header>
			<Card.Content>
				<Field.Group class="gap-4">
					<Field.Field>
						<Field.Label for="l-title">Title</Field.Label>
						<Input id="l-title" required maxlength={200} bind:value={title} />
					</Field.Field>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field.Field>
							<Field.Label for="l-rent">Rent / month</Field.Label>
							<MoneyInput
								id="l-rent"
								bind:value={() => rentAmount, (v) => ((rentAmount = v), (dirty = true))}
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="l-deposit">Deposit</Field.Label>
							<MoneyInput
								id="l-deposit"
								bind:value={() => depositAmount, (v) => ((depositAmount = v), (dirty = true))}
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="l-available">Available from</Field.Label>
							<Input id="l-available" type="date" bind:value={availableOn} />
							<Field.Description>Leave empty for “available now”.</Field.Description>
						</Field.Field>
						<Field.Field>
							<Field.Label for="l-term">Lease term (months)</Field.Label>
							<Input
								id="l-term"
								type="number"
								inputmode="numeric"
								min={1}
								max={120}
								bind:value={leaseTermMonths}
							/>
						</Field.Field>
					</div>
					<Field.Field>
						<Field.Label for="l-desc">Description</Field.Label>
						<Textarea
							id="l-desc"
							rows={6}
							maxlength={10000}
							placeholder="What makes this home great? Light, layout, neighborhood, recent updates…"
							bind:value={description}
						/>
						<Field.Description
							>Describe the home, not who should live there. Avoid phrases like “perfect for
							singles” or “no kids”.</Field.Description
						>
					</Field.Field>
					<Field.Field>
						<Field.Label for="l-pets">Pet policy</Field.Label>
						<Input
							id="l-pets"
							placeholder="e.g. Cats and small dogs welcome"
							bind:value={petPolicy}
						/>
					</Field.Field>
				</Field.Group>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header><Card.Title>Amenities</Card.Title></Card.Header>
			<Card.Content class="space-y-3">
				<div class="flex flex-wrap gap-2">
					{#each suggestions as a (a)}
						<Button
							type="button"
							size="sm"
							variant={amenities.includes(a) ? 'secondary' : 'outline'}
							aria-pressed={amenities.includes(a)}
							class="h-7 rounded-full"
							onclick={() => toggleAmenity(a)}>{a}</Button
						>
					{/each}
				</div>
				<div class="flex max-w-sm gap-2">
					<Input
						class="h-8"
						placeholder="Add your own"
						maxlength={60}
						bind:value={customAmenity}
						onkeydown={(e) => e.key === 'Enter' && addCustom(e)}
					/>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						disabled={!customAmenity.trim()}
						onclick={() => {
							const a = customAmenity.trim();
							if (a && !amenities.includes(a)) amenities = [...amenities, a];
							customAmenity = '';
							dirty = true;
						}}><Plus /> Add</Button
					>
				</div>
			</Card.Content>
		</Card.Root>

		<div
			class="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0"
		>
			{#if dirty}<span class="text-sm text-muted-foreground">Unsaved changes</span>{/if}
			<Button type="submit" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</Button>
		</div>
	</form>

	<aside class="space-y-4">
		<Card.Root size="sm">
			<Card.Header>
				<Card.Description>Applications</Card.Description>
				<Card.Title class="text-xl tabular-nums"
					>{listing.applications.total}
					{#if listing.applications.new}<span
							class="text-sm font-normal text-sky-700 dark:text-sky-400"
							>· {listing.applications.new} new</span
						>{/if}</Card.Title
				>
			</Card.Header>
			<Card.Footer>
				<Button size="sm" variant="outline" href="/leasing" class="w-full"
					>Review applications</Button
				>
			</Card.Footer>
		</Card.Root>
		<p class="text-xs leading-relaxed text-muted-foreground">
			Applicants are asked for contact details, move-in date, household size, income and pets only.
			Leroa never asks about protected characteristics and doesn't run credit or background checks.
		</p>
	</aside>
</main>
