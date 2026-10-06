<script lang="ts">
	import type { PageProps } from './$types';
	import { Button } from '#lib/components/ui/button/index.js';
	import PublicContact from '#lib/components/app/public-contact.svelte';
	import { formatMoney, todayISO } from '#lib/format.ts';
	import { availability, unitFacts } from '#lib/listings.ts';
	import Building2 from '@lucide/svelte/icons/building-2';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Check from '@lucide/svelte/icons/check';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data }: PageProps = $props();
	const p = $derived(data.property);
	const today = todayISO();
	const address = $derived(
		[p.addressLine1, p.city, [p.region, p.postalCode].filter(Boolean).join(' ')]
			.filter(Boolean)
			.join(', ')
	);
	const photos = $derived(data.listings.filter((l) => l.photoId));
	const photo = (l: { id: string; photoId: string | null }) =>
		`/l/${data.org.slug}/${l.id}/photos/${l.photoId}`;
	const fromRent = $derived(
		data.listings.length ? Math.min(...data.listings.map((l) => l.rentAmount)) : null
	);
	const currency = $derived(data.listings[0]?.currency ?? 'USD');
	const summary = $derived(
		data.listings.length
			? `${data.listings.length} available from ${formatMoney(fromRent, currency)}/mo`
			: `Join the waitlist for ${p.name}`
	);
</script>

<svelte:head>
	<title>{p.name} · {data.org.name}</title>
	<meta name="description" content="{p.name}{address ? `, ${address}` : ''}. {summary}." />
	<meta property="og:title" content="{p.name} · {data.org.name}" />
	<meta property="og:description" content={summary} />
	{#if photos[0]}<meta property="og:image" content={photo(photos[0])} />{/if}
	{#if data.preview}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<header class="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
		<a href="/l/{data.org.slug}" class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
			<ArrowLeft class="size-4 shrink-0" /><span class="truncate">{data.org.name}</span>
		</a>
		<Button size="sm" href="#contact"
			>{data.selfBooking
				? 'Book a tour'
				: data.listings.length
					? 'Contact us'
					: 'Join waitlist'}</Button
		>
	</div>
</header>

{#if data.preview}
	<div class="bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-800 dark:text-amber-300">
		Preview: this page isn't public yet. Publish a listing here or turn on its public page.
	</div>
{/if}

<main class="mx-auto max-w-6xl px-4 pt-4 pb-16 md:pt-8">
	{#if photos.length}
		<div class="grid gap-2 overflow-hidden rounded-xl md:grid-cols-[2fr_1fr] md:grid-rows-2">
			{#each photos.slice(0, 3) as l, i (l.id)}
				<img
					src={photo(l)}
					alt={l.title}
					loading={i === 0 ? 'eager' : 'lazy'}
					fetchpriority={i === 0 ? 'high' : undefined}
					class="size-full bg-muted object-cover {i === 0
						? 'aspect-[16/10] md:row-span-2 md:aspect-auto'
						: 'hidden aspect-[16/10] md:block'}"
				/>
			{/each}
		</div>
	{:else}
		<div
			class="grid aspect-[16/10] place-items-center rounded-xl bg-muted text-muted-foreground md:aspect-[3/1]"
		>
			<Building2 class="size-12" />
		</div>
	{/if}

	<div class="mt-6 grid gap-10 lg:grid-cols-[1fr_22rem]">
		<div class="min-w-0 space-y-8">
			<section class="space-y-2">
				<h1 class="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{p.name}</h1>
				{#if address}
					<p class="flex items-start gap-1.5 text-muted-foreground">
						<MapPin class="mt-0.5 size-4 shrink-0" />{address}
					</p>
				{/if}
				<p class="pt-1 font-medium">
					{#if fromRent != null}
						{data.listings.length} available · from
						<span class="tabular-nums">{formatMoney(fromRent, currency)}</span>/mo
					{:else}
						Nothing available right now
					{/if}
				</p>
			</section>

			{#if p.marketingDescription}
				<section>
					<h2 class="mb-2 font-semibold">About {p.name}</h2>
					<p class="leading-relaxed text-pretty whitespace-pre-line">{p.marketingDescription}</p>
				</section>
			{/if}

			{#if p.amenities.length}
				<section>
					<h2 class="mb-3 font-semibold">Amenities</h2>
					<ul class="grid gap-2 sm:grid-cols-2">
						{#each p.amenities as a (a)}
							<li class="flex items-center gap-2 text-sm">
								<Check class="size-4 text-emerald-600" />{a}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section>
				<h2 class="mb-3 font-semibold">Available homes</h2>
				{#if data.listings.length}
					<ul class="divide-y rounded-xl border">
						{#each data.listings as l (l.id)}
							<li>
								<a
									href="/l/{data.org.slug}/{l.id}"
									class="flex items-center gap-4 p-3 transition-colors hover:bg-muted/50"
								>
									<div class="size-16 shrink-0 overflow-hidden rounded-lg bg-muted sm:size-20">
										{#if l.photoId}
											<img src={photo(l)} alt="" loading="lazy" class="size-full object-cover" />
										{:else}
											<div class="grid size-full place-items-center text-muted-foreground">
												<Building2 class="size-6" />
											</div>
										{/if}
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate font-medium">{l.title}</p>
										<p class="truncate text-sm text-muted-foreground">
											{[l.unitName, unitFacts(l)].filter(Boolean).join(' · ')}
										</p>
										<p class="text-xs text-emerald-700 dark:text-emerald-400">
											{availability(l.availableOn, today)}
										</p>
									</div>
									<p class="shrink-0 font-semibold tabular-nums">
										{formatMoney(l.rentAmount, l.currency)}<span
											class="text-xs font-normal text-muted-foreground">/mo</span
										>
									</p>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-muted-foreground">
						Every home here is taken right now. Join the waitlist and we'll email you when one opens
						up.
					</p>
				{/if}
			</section>
		</div>

		<aside id="contact" class="scroll-mt-20">
			<div class="space-y-4 rounded-xl border p-5 lg:sticky lg:top-20">
				<h2 class="font-semibold">
					{data.listings.length ? 'Come take a look' : 'Join the waitlist'}
				</h2>
				<PublicContact
					org={data.org}
					propertyId={p.id}
					selfBooking={data.selfBooking}
					preview={data.preview}
					waitlistDefault={data.listings.length === 0}
				/>
			</div>
		</aside>
	</div>
</main>

<footer class="border-t py-6 text-center text-xs text-muted-foreground">
	Powered by <a href="https://github.com/maxffarrell/leroa" class="underline">Leroa</a>
</footer>
