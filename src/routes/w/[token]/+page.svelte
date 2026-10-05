<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import { getWorkOrder, updateWorkOrder } from '#lib/remote/work-orders.remote.ts';
	import { formatDate, formatMoney, formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	const token = page.params.token!;
	const w = $derived(await getWorkOrder(token));
	const address = $derived(
		[
			w.property.addressLine1,
			w.property.addressLine2,
			w.property.city,
			[w.property.region, w.property.postalCode].filter(Boolean).join(' ')
		]
			.filter(Boolean)
			.join(', ')
	);
	const mapUrl = $derived(
		`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || w.property.name)}`
	);
	const cancelled = $derived(w.status === 'cancelled');
	const done = $derived(w.status === 'done');

	let note = $state('');
	let cost = $state<number | null>(null);
	let costTouched = $state(false);
	let pending = $state<string | null>(null);
	let uploading = $state(false);

	$effect.pre(() => {
		if (!costTouched) cost = w.costAmount;
	});

	async function send(status?: 'in_progress' | 'on_hold' | 'done') {
		pending = status ?? 'note';
		try {
			await updateWorkOrder({
				token,
				status,
				costAmount: costTouched ? cost : undefined,
				note: note.trim() || undefined
			});
			toast.success(
				status === 'done'
					? 'Marked done. Thanks!'
					: status === 'in_progress'
						? 'Marked as started'
						: status === 'on_hold'
							? 'Put on hold'
							: 'Update sent'
			);
			note = '';
			costTouched = false;
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not send');
		} finally {
			pending = null;
		}
	}

	async function upload(files: FileList | null) {
		const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (!images.length) return;
		uploading = true;
		try {
			const body = new FormData();
			for (const f of images) body.append('file', f);
			const res = await fetch(`/w/${token}/photos`, { method: 'POST', body });
			if (!res.ok) toast.error((await res.json().catch(() => null))?.message ?? 'Upload failed');
			else toast.success(images.length === 1 ? 'Photo added' : `${images.length} photos added`);
			await getWorkOrder(token).refresh();
		} finally {
			uploading = false;
		}
	}

	const who = { staff: 'Property manager', vendor: 'You', tenant: 'Resident' } as const;
</script>

<svelte:head>
	<title>Work order #{w.number} · {w.orgName}</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<header class="border-b bg-background">
	<div class="mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4">
		<span class="truncate font-medium">{w.orgName}</span>
		<span class="text-sm text-muted-foreground">Work order for {w.vendorName}</span>
	</div>
</header>

<main class="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-16 md:py-8">
	<div>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-sm text-muted-foreground tabular-nums">#{w.number}</span>
			<StatusBadge status={w.status} />
			{#if w.priority !== 'normal'}<StatusBadge status={w.priority} />{/if}
		</div>
		<h1 class="mt-1 text-xl font-semibold text-balance md:text-2xl">{w.title}</h1>
	</div>

	{#if cancelled}
		<p class="rounded-lg border bg-muted/50 p-3 text-sm">
			This work order was cancelled. You don't need to do anything else.
		</p>
	{:else if done}
		<p
			class="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
		>
			<CircleCheck class="size-4 shrink-0" /> Marked done. You can still add a note, photos or the final
			cost.
		</p>
	{/if}

	<Card.Root>
		<Card.Content class="space-y-3 text-sm">
			<a
				href={mapUrl}
				target="_blank"
				rel="noreferrer noopener"
				class="flex items-start gap-2 hover:underline"
			>
				<MapPin class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<span
					><span class="font-medium"
						>{w.property.name}{w.unitName ? ` · Unit ${w.unitName}` : ' · Common area'}</span
					>{#if address}<br /><span class="text-muted-foreground">{address}</span>{/if}</span
				>
			</a>
			{#if w.dueDate}
				<p class="flex items-center gap-2">
					<CalendarClock class="size-4 text-muted-foreground" /> Needed by {formatDate(w.dueDate)}
				</p>
			{/if}
			{#if w.description}
				<p class="border-t pt-3 whitespace-pre-line">{w.description}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title class="text-base">Photos</Card.Title></Card.Header>
		<Card.Content>
			<ul class="grid grid-cols-3 gap-2 sm:grid-cols-4">
				{#each w.photos as p (p.id)}
					<li class="aspect-square overflow-hidden rounded-md bg-muted">
						<a href="/w/{token}/photos/{p.id}" target="_blank" rel="noreferrer"
							><img
								src="/w/{token}/photos/{p.id}"
								alt={p.name}
								loading="lazy"
								class="size-full object-cover"
							/></a
						>
					</li>
				{/each}
				{#if !cancelled}
					<li>
						<label
							class="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
						>
							<ImagePlus class="size-5" />
							{uploading ? 'Uploading…' : 'Add photos'}
							<input
								type="file"
								accept="image/*"
								multiple
								class="sr-only"
								disabled={uploading}
								onchange={(e) => {
									void upload(e.currentTarget.files);
									e.currentTarget.value = '';
								}}
							/>
						</label>
					</li>
				{/if}
			</ul>
		</Card.Content>
	</Card.Root>

	{#if !cancelled}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">Send an update</Card.Title></Card.Header>
			<Card.Content>
				<form
					class="space-y-4"
					onsubmit={(e) => {
						e.preventDefault();
						void send();
					}}
				>
					<Field.Field>
						<Field.Label for="wo-note">Note</Field.Label>
						<Textarea
							id="wo-note"
							rows={3}
							placeholder="Arrival time, parts needed, what you found…"
							bind:value={note}
						/>
					</Field.Field>
					<Field.Field class="sm:max-w-48">
						<Field.Label for="wo-cost">Cost (optional)</Field.Label>
						<div oninput={() => (costTouched = true)}>
							<MoneyInput id="wo-cost" bind:value={cost} />
						</div>
					</Field.Field>
					<div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
						{#if !done}
							{#if w.status !== 'in_progress'}
								<Button type="button" disabled={!!pending} onclick={() => send('in_progress')}
									>{pending === 'in_progress' ? 'Sending…' : 'Start work'}</Button
								>
							{:else}
								<Button
									type="button"
									variant="outline"
									disabled={!!pending}
									onclick={() => send('on_hold')}
									>{pending === 'on_hold' ? 'Sending…' : 'Put on hold'}</Button
								>
							{/if}
							<Button
								type="button"
								variant={w.status === 'in_progress' ? 'default' : 'outline'}
								disabled={!!pending}
								onclick={() => send('done')}>{pending === 'done' ? 'Sending…' : 'Mark done'}</Button
							>
						{/if}
						<Button
							type="submit"
							variant="ghost"
							disabled={!!pending || (!note.trim() && !costTouched)}
							>{pending === 'note' ? 'Sending…' : 'Send note only'}</Button
						>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if w.notes.length || w.costAmount != null}
		<Card.Root>
			<Card.Header><Card.Title class="text-base">History</Card.Title></Card.Header>
			<Card.Content class="space-y-3 text-sm">
				{#if w.costAmount != null}
					<p>
						Reported cost: <span class="font-medium tabular-nums">{formatMoney(w.costAmount)}</span>
					</p>
				{/if}
				<ol class="space-y-3">
					{#each w.notes as n (n.id)}
						<li class="rounded-md bg-muted/50 p-3">
							<p class="text-xs text-muted-foreground">
								{n.authorType === 'staff' ? n.authorName : who[n.authorType]} · {formatRelative(
									n.createdAt
								)}
							</p>
							<p class="mt-1 whitespace-pre-line">{n.body}</p>
						</li>
					{/each}
				</ol>
			</Card.Content>
		</Card.Root>
	{/if}

	<p class="text-center text-xs text-muted-foreground">
		Anyone with this link can view and update this job. Don't forward it.
	</p>
</main>
