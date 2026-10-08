<script lang="ts">
	import type { PageProps } from './$types';
	import { formatMoney, todayISO } from '#lib/format.ts';
	import { availability, unitFacts } from '#lib/listings.ts';
	import Building2 from '@lucide/svelte/icons/building-2';
	import MapPin from '@lucide/svelte/icons/map-pin';

	let { data }: PageProps = $props();
	const brandName = $derived(data.org.portalTitle ?? data.org.name);
	const today = todayISO();
</script>

<svelte:head>
	<title>Homes for rent · {brandName}</title>
	<meta name="description" content="Available rentals from {brandName}. Apply online." />
	<meta property="og:title" content="Homes for rent · {brandName}" />
</svelte:head>

<header class="border-b">
	<div class="mx-auto flex h-14 max-w-6xl items-center px-4">
		<span class="font-semibold" style:color={data.org.accentColor}>{brandName}</span>
	</div>
</header>

<main class="mx-auto max-w-6xl px-4 py-8 md:py-12">
	<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">Homes for rent</h1>
	<p class="mt-1 text-muted-foreground">
		{data.listings.length
			? `${data.listings.length} available ${data.listings.length === 1 ? 'home' : 'homes'}`
			: 'Nothing is available right now. Check back soon.'}
	</p>

	{#if data.properties.length}
		<nav class="mt-5 flex flex-wrap gap-2" aria-label="Properties">
			{#each data.properties as p (p.id)}
				<a
					href="/l/{data.org.slug}/p/{p.id}"
					class="rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted"
					>{p.name}{#if p.publishedListings}<span class="ml-1.5 text-muted-foreground tabular-nums"
							>{p.publishedListings}</span
						>{/if}</a
				>
			{/each}
		</nav>
	{/if}

	<ul class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
		{#each data.listings as l, i (l.id)}
			<li>
				<a href="/l/{data.org.slug}/{l.id}" class="group block rounded-xl outline-none">
					<div
						class="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted ring-offset-2 group-focus-visible:ring-2 group-focus-visible:ring-ring"
					>
						{#if l.photoId}
							<img
								src="/l/{data.org.slug}/{l.id}/photos/{l.photoId}"
								alt=""
								loading={i < 3 ? 'eager' : 'lazy'}
								class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
							/>
						{:else}
							<div class="grid size-full place-items-center text-muted-foreground">
								<Building2 class="size-10" />
							</div>
						{/if}
						<span
							class="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur"
							>{availability(l.availableOn, today)}</span
						>
					</div>
					<div class="mt-3 space-y-0.5">
						<p class="text-lg font-semibold tabular-nums">
							{formatMoney(l.rentAmount, l.currency)}<span
								class="text-sm font-normal text-muted-foreground">/mo</span
							>
						</p>
						{#if unitFacts(l)}<p class="text-sm">{unitFacts(l)}</p>{/if}
						<p class="truncate text-sm font-medium group-hover:underline">{l.title}</p>
						<p class="flex items-center gap-1 truncate text-sm text-muted-foreground">
							<MapPin class="size-3.5 shrink-0" />
							{[l.addressLine1, l.city, l.region].filter(Boolean).join(', ') || l.propertyName}
						</p>
					</div>
				</a>
			</li>
		{/each}
	</ul>
</main>

<footer class="border-t py-6 text-center text-xs text-muted-foreground">
	Listings powered by <a href="https://github.com/maxffarrell/leroa" class="underline">Leroa</a>
</footer>
