<script lang="ts">
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Carousel from '#lib/components/ui/carousel/index.js';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import PublicContact from '#lib/components/app/public-contact.svelte';
	import { submitApplication } from '#lib/remote/listings.remote.ts';
	import { formatDate, formatMoney, todayISO } from '#lib/format.ts';
	import { availability, unitFacts } from '#lib/listings.ts';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Building2 from '@lucide/svelte/icons/building-2';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import Check from '@lucide/svelte/icons/check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data }: PageProps = $props();
	const brandName = $derived(data.org.portalTitle ?? data.org.name);
	const l = $derived(data.listing);
	const today = todayISO();
	const address = $derived(
		[l.addressLine1, l.city, [l.region, l.postalCode].filter(Boolean).join(' ')]
			.filter(Boolean)
			.join(', ')
	);
	const facts = $derived(unitFacts(l));
	const photoUrl = (id: string) => `/l/${data.org.slug}/${l.id}/photos/${id}`;
	const summary = $derived(
		`${formatMoney(l.rentAmount, l.currency)}/mo${facts ? ` · ${facts}` : ''} · ${availability(l.availableOn, today)}`
	);

	const blank = () => ({
		firstName: '',
		lastName: '',
		email: '',
		phone: '',
		moveInDate: '',
		occupants: 1,
		pets: '',
		employer: '',
		monthlyIncome: null as number | null,
		currentAddress: '',
		message: '',
		consent: false,
		website: ''
	});
	let form = $state(blank());
	let pending = $state(false);
	let submitted = $state(false);
	const profileHref = $derived(
		`/api/profile/connect?next=${encodeURIComponent(`${page.url.pathname}#apply`)}`
	);

	onMount(() => {
		if (data.prefill && Object.keys(data.prefill).length) {
			form = { ...form, ...data.prefill };
			toast.success('Filled in from your Leroa profile. Check everything before you send it.');
		} else if (page.url.searchParams.get('profile') === 'connected') {
			toast.info('Your Leroa profile had nothing to fill in yet.');
		} else if (page.url.searchParams.get('profile') === 'failed') {
			toast.error('Could not read your Leroa profile. Fill in the form instead.');
		} else if (page.url.searchParams.get('profile') === 'declined') {
			toast.info('Nothing was shared');
		}
		if (page.url.searchParams.has('profile')) {
			const u = new URL(page.url.href);
			u.searchParams.delete('profile');
			replaceState(u, page.state);
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (data.preview) return toast.error('Publish the listing to accept applications');
		if (!form.consent) return toast.error('Confirm the information is accurate');
		pending = true;
		try {
			await submitApplication({
				listingId: l.id,
				...form,
				consent: true,
				phone: form.phone || null,
				moveInDate: form.moveInDate || null,
				pets: form.pets || null,
				employer: form.employer || null,
				currentAddress: form.currentAddress || null,
				message: form.message || null,
				occupants: Math.max(1, Math.round(form.occupants || 1))
			});
			submitted = true;
			form = blank();
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not send your application'
			);
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head>
	<title>{l.title} · {brandName}</title>
	<meta name="description" content={summary} />
	<meta property="og:title" content={l.title} />
	<meta property="og:description" content={summary} />
	{#if data.photos[0]}<meta
			property="og:image"
			content="{page.url.origin}{photoUrl(data.photos[0])}"
		/>{/if}
	{#if data.preview}<meta name="robots" content="noindex" />{/if}
</svelte:head>

<header class="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
		<a href="/l/{data.org.slug}" class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
			<ArrowLeft class="size-4 shrink-0" /><span class="truncate" style:color={data.org.accentColor}
				>{brandName}</span
			>
		</a>
		<Button size="sm" href="#apply" class="hidden sm:inline-flex">Apply now</Button>
	</div>
</header>

{#if data.preview}
	<div class="bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-800 dark:text-amber-300">
		Preview: this listing is {l.status === 'closed' ? 'closed' : 'not published yet'}, so only your
		team can see it.
	</div>
{/if}

<main class="mx-auto max-w-5xl px-4 pt-4 pb-28 md:pt-8 lg:pb-16">
	{#if data.photos.length}
		<Carousel.Root class="relative" opts={{ loop: data.photos.length > 1 }}>
			<Carousel.Content>
				{#each data.photos as id, i (id)}
					<Carousel.Item>
						<div class="aspect-[16/10] overflow-hidden rounded-xl bg-muted md:aspect-[2/1]">
							<img
								src={photoUrl(id)}
								alt="{l.title}, photo {i + 1} of {data.photos.length}"
								loading={i === 0 ? 'eager' : 'lazy'}
								fetchpriority={i === 0 ? 'high' : undefined}
								class="size-full object-cover"
							/>
						</div>
					</Carousel.Item>
				{/each}
			</Carousel.Content>
			{#if data.photos.length > 1}
				<Carousel.Previous class="left-3 hidden sm:inline-flex" />
				<Carousel.Next class="right-3 hidden sm:inline-flex" />
				<span
					class="pointer-events-none absolute right-3 bottom-3 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium"
					>{data.photos.length} photos</span
				>
			{/if}
		</Carousel.Root>
	{:else}
		<div
			class="grid aspect-[16/10] place-items-center rounded-xl bg-muted text-muted-foreground md:aspect-[3/1]"
		>
			<Building2 class="size-12" />
		</div>
	{/if}

	<div class="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="min-w-0 space-y-8">
			<section class="space-y-2">
				<h1 class="text-2xl font-semibold tracking-tight text-balance md:text-3xl">{l.title}</h1>
				{#if address}
					<p class="flex items-start gap-1.5 text-muted-foreground">
						<MapPin class="mt-0.5 size-4 shrink-0" />{address}
					</p>
				{/if}
				<p class="text-sm">
					<a href="/l/{data.org.slug}/p/{l.propertyId}" class="underline underline-offset-2"
						>More about {l.propertyName}</a
					>
				</p>
				<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-1">
					<p class="text-xl font-semibold tabular-nums">
						{formatMoney(l.rentAmount, l.currency)}<span
							class="text-sm font-normal text-muted-foreground">/mo</span
						>
					</p>
					{#if facts}<p>{facts}</p>{/if}
					<p class="text-sm text-emerald-700 dark:text-emerald-400">
						{availability(l.availableOn, today)}
					</p>
				</div>
			</section>

			{#if l.description}
				<section>
					<h2 class="mb-2 font-semibold">About this home</h2>
					<p class="leading-relaxed text-pretty whitespace-pre-line">{l.description}</p>
				</section>
			{/if}

			{#if l.amenities.length}
				<section>
					<h2 class="mb-3 font-semibold">Amenities</h2>
					<ul class="grid gap-2 sm:grid-cols-2">
						{#each l.amenities as a (a)}
							<li class="flex items-center gap-2 text-sm">
								<Check class="size-4 text-emerald-600" />{a}
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section>
				<h2 class="mb-3 font-semibold">Lease details</h2>
				<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
					<div>
						<dt class="text-muted-foreground">Rent</dt>
						<dd class="font-medium tabular-nums">{formatMoney(l.rentAmount, l.currency)}/mo</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">Deposit</dt>
						<dd class="font-medium tabular-nums">
							{l.depositAmount ? formatMoney(l.depositAmount, l.currency) : 'None'}
						</dd>
					</div>
					<div>
						<dt class="text-muted-foreground">Available</dt>
						<dd class="font-medium">
							{l.availableOn && l.availableOn > today ? formatDate(l.availableOn) : 'Now'}
						</dd>
					</div>
					{#if l.leaseTermMonths}
						<div>
							<dt class="text-muted-foreground">Lease term</dt>
							<dd class="font-medium">{l.leaseTermMonths} months</dd>
						</div>
					{/if}
					{#if l.petPolicy}
						<div class="col-span-2">
							<dt class="text-muted-foreground">Pets</dt>
							<dd class="font-medium">{l.petPolicy}</dd>
						</div>
					{/if}
				</dl>
			</section>

			<section id="tour" class="scroll-mt-20 border-t pt-8 lg:hidden">
				<h2 class="mb-4 text-lg font-semibold">
					{data.selfBooking ? 'See it in person' : 'Have a question?'}
				</h2>
				<PublicContact
					org={data.org}
					propertyId={l.propertyId}
					listingId={l.id}
					selfBooking={data.selfBooking}
					preview={data.preview}
				/>
			</section>

			<section id="apply" class="scroll-mt-20 border-t pt-8">
				{#if submitted}
					<div class="flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
						<CircleCheck class="size-10 text-emerald-600" />
						<h2 class="text-lg font-semibold">Application sent</h2>
						<p class="max-w-sm text-sm text-muted-foreground">
							Thanks! {brandName} will review it and get back to you by email.
						</p>
						<Button variant="outline" href="/l/{data.org.slug}">See other homes</Button>
					</div>
				{:else}
					<h2 class="text-lg font-semibold">Apply for this home</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Takes about two minutes. No account or fee needed.
					</p>
					{#if data.profileHub && !data.preview}
						<Button variant="outline" class="mt-4 w-full sm:w-auto" href={profileHref}>
							<UserRound class="size-4" /> Fill from my Leroa profile
						</Button>
					{/if}
					<form class="mt-5" onsubmit={submit}>
						<Field.Group class="gap-4">
							<div class="grid gap-4 sm:grid-cols-2">
								<Field.Field>
									<Field.Label for="a-first">First name</Field.Label>
									<Input
										id="a-first"
										autocomplete="given-name"
										required
										bind:value={form.firstName}
									/>
								</Field.Field>
								<Field.Field>
									<Field.Label for="a-last">Last name</Field.Label>
									<Input
										id="a-last"
										autocomplete="family-name"
										required
										bind:value={form.lastName}
									/>
								</Field.Field>
								<Field.Field>
									<Field.Label for="a-email">Email</Field.Label>
									<Input
										id="a-email"
										type="email"
										autocomplete="email"
										required
										bind:value={form.email}
									/>
								</Field.Field>
								<Field.Field>
									<Field.Label for="a-phone">Phone</Field.Label>
									<Input id="a-phone" type="tel" autocomplete="tel" bind:value={form.phone} />
								</Field.Field>
								<Field.Field>
									<Field.Label for="a-move">Preferred move-in</Field.Label>
									<Input id="a-move" type="date" min={today} bind:value={form.moveInDate} />
								</Field.Field>
								<Field.Field>
									<Field.Label for="a-occ">People living here</Field.Label>
									<Input
										id="a-occ"
										type="number"
										inputmode="numeric"
										min={1}
										max={20}
										bind:value={form.occupants}
									/>
								</Field.Field>
								<Field.Field>
									<Field.Label for="a-employer">Employer or income source</Field.Label>
									<Input id="a-employer" bind:value={form.employer} />
								</Field.Field>
								<Field.Field>
									<Field.Label for="a-income">Monthly income</Field.Label>
									<MoneyInput id="a-income" bind:value={form.monthlyIncome} />
								</Field.Field>
							</div>
							<Field.Field>
								<Field.Label for="a-address">Current address</Field.Label>
								<Input
									id="a-address"
									autocomplete="street-address"
									bind:value={form.currentAddress}
								/>
							</Field.Field>
							<Field.Field>
								<Field.Label for="a-pets">Pets</Field.Label>
								<Input id="a-pets" placeholder="e.g. one cat" bind:value={form.pets} />
							</Field.Field>
							<Field.Field>
								<Field.Label for="a-msg">Anything else?</Field.Label>
								<Textarea id="a-msg" rows={3} bind:value={form.message} />
							</Field.Field>
							<div class="sr-only" aria-hidden="true">
								<label for="a-website">Website</label>
								<input id="a-website" tabindex="-1" autocomplete="off" bind:value={form.website} />
							</div>
							<Field.Field orientation="horizontal">
								<Checkbox id="a-consent" bind:checked={form.consent} />
								<Field.Label for="a-consent" class="text-sm leading-snug font-normal">
									The information above is accurate, and {brandName} may contact me about this application.
								</Field.Label>
							</Field.Field>
							<Button type="submit" size="lg" class="w-full sm:w-auto" disabled={pending}>
								{pending ? 'Sending…' : 'Send application'}
							</Button>
						</Field.Group>
					</form>
				{/if}
			</section>
		</div>

		<aside class="hidden lg:sticky lg:top-20 lg:block lg:self-start">
			<div class="space-y-3 rounded-xl border p-5">
				<p class="text-2xl font-semibold tabular-nums">
					{formatMoney(l.rentAmount, l.currency)}<span
						class="text-sm font-normal text-muted-foreground">/mo</span
					>
				</p>
				<p class="text-sm text-muted-foreground">{availability(l.availableOn, today)}</p>
				<Button href="#apply" class="w-full">Apply now</Button>
			</div>
			<div class="mt-4 space-y-3 rounded-xl border p-5">
				<h2 class="font-semibold">
					{data.selfBooking ? 'See it in person' : 'Have a question?'}
				</h2>
				<PublicContact
					org={data.org}
					propertyId={l.propertyId}
					listingId={l.id}
					selfBooking={data.selfBooking}
					preview={data.preview}
				/>
			</div>
		</aside>
	</div>
</main>

{#if !submitted}
	<div
		class="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
	>
		<div class="min-w-0">
			<p class="font-semibold tabular-nums">
				{formatMoney(l.rentAmount, l.currency)}<span
					class="text-sm font-normal text-muted-foreground">/mo</span
				>
			</p>
			<p class="truncate text-xs text-muted-foreground">{availability(l.availableOn, today)}</p>
		</div>
		<div class="flex gap-2">
			<Button href="#tour" variant="outline">{data.selfBooking ? 'Tour' : 'Ask'}</Button>
			<Button href="#apply">Apply now</Button>
		</div>
	</div>
{/if}
