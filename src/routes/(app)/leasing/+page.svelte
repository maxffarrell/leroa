<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import NewListingDialog from '#lib/components/app/new-listing-dialog.svelte';
	import NewLeadDialog from '#lib/components/app/new-lead-dialog.svelte';
	import LeadsView from '#lib/components/app/leads-view.svelte';
	import ToursView from '#lib/components/app/tours-view.svelte';
	import { getLeasingSettings, initLeasingTimezone } from '#lib/remote/crm.remote.ts';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { getApplications, getListings } from '#lib/remote/listings.remote.ts';
	import { formatDate, formatMoney, formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Link from '@lucide/svelte/icons/link';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Building2 from '@lucide/svelte/icons/building-2';

	const apps = $derived(await getApplications());
	const listings = $derived(await getListings());

	const settings = $derived(await getLeasingSettings());
	const TABS = ['leads', 'tours', 'applications', 'listings'];
	const initialTab = page.url.searchParams.get('tab') ?? '';
	let tab = $state(TABS.includes(initialTab) ? initialTab : 'leads');
	let filter = $state<'open' | 'decided' | 'all'>('open');
	let creating = $state(
		page.url.searchParams.has('new') && page.url.searchParams.get('new') !== 'lead'
	);
	let creatingLead = $state(page.url.searchParams.get('new') === 'lead');

	$effect(() => {
		if (settings.configured) return;
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (tz) void initLeasingTimezone(tz).catch(() => {});
	});

	function create() {
		if (tab === 'leads' || tab === 'tours') creatingLead = true;
		else creating = true;
	}

	const isOpen = (s: string) => s === 'new' || s === 'reviewing';
	const rows = $derived(
		apps.filter((a) =>
			filter === 'all' ? true : filter === 'open' ? isOpen(a.status) : !isOpen(a.status)
		)
	);
	const newCount = $derived(apps.filter((a) => a.status === 'new').length);
	const liveCount = $derived(listings.filter((l) => l.status === 'published').length);
	const publicUrl = $derived(`${page.url.origin}/l/${page.data.org?.slug}`);

	const nav = new RowNav({
		count: () => (tab === 'applications' ? rows.length : tab === 'listings' ? listings.length : 0),
		open: (i) =>
			openHref(
				tab === 'applications'
					? `/leasing/applications/${rows[i]!.id}`
					: `/leasing/listings/${listings[i]!.id}`
			),
		create
	});

	async function copyLink() {
		await navigator.clipboard.writeText(publicUrl);
		toast.success('Public page link copied');
	}
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Leasing">
	{#snippet actions()}
		<Button size="sm" variant="outline" onclick={copyLink}
			><Link /> <span class="hidden sm:inline">Copy public link</span></Button
		>
		<Button size="sm" onclick={create}
			><Plus />
			<span class="hidden sm:inline"
				>{tab === 'leads' || tab === 'tours' ? 'New lead' : 'New listing'}</span
			>
			<Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	<Tabs.Root bind:value={tab} onValueChange={() => (nav.index = -1)}>
		<Tabs.List class="mb-4 max-w-full justify-start overflow-x-auto">
			<Tabs.Trigger value="leads">Leads</Tabs.Trigger>
			<Tabs.Trigger value="tours">Tours</Tabs.Trigger>
			<Tabs.Trigger value="applications"
				>Applications
				{#if newCount}<span
						class="ml-1 rounded-full bg-sky-500/15 px-1.5 text-xs text-sky-700 tabular-nums dark:text-sky-400"
						>{newCount} new</span
					>{/if}</Tabs.Trigger
			>
			<Tabs.Trigger value="listings"
				>Listings <span class="ml-1 text-xs text-muted-foreground tabular-nums"
					>{liveCount} live</span
				></Tabs.Trigger
			>
		</Tabs.List>

		<Tabs.Content value="leads">
			<LeadsView timezone={settings.timezone} oncreate={() => (creatingLead = true)} />
		</Tabs.Content>

		<Tabs.Content value="tours">
			<ToursView timezone={settings.timezone} />
		</Tabs.Content>

		<Tabs.Content value="applications">
			{#if apps.length === 0}
				<Empty.Root class="border">
					<Empty.Header>
						<Empty.Media variant="icon"><Inbox /></Empty.Media>
						<Empty.Title>No applications yet</Empty.Title>
						<Empty.Description
							>Publish a listing and share its link. Applications land here.</Empty.Description
						>
					</Empty.Header>
					<Empty.Content
						><Button onclick={() => (creating = true)}><Plus /> New listing</Button></Empty.Content
					>
				</Empty.Root>
			{:else}
				<div class="mb-3 flex gap-1" role="group" aria-label="Filter applications">
					{#each [['open', 'Open'], ['decided', 'Decided'], ['all', 'All']] as const as [value, label] (value)}
						<Button
							size="sm"
							variant={filter === value ? 'secondary' : 'ghost'}
							aria-pressed={filter === value}
							onclick={() => ((filter = value), (nav.index = -1))}>{label}</Button
						>
					{/each}
				</div>
				<div class="overflow-x-auto rounded-lg border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Applicant</Table.Head>
								<Table.Head class="hidden sm:table-cell">Home</Table.Head>
								<Table.Head class="hidden md:table-cell">Move-in</Table.Head>
								<Table.Head class="hidden text-right md:table-cell">Income / mo</Table.Head>
								<Table.Head class="hidden lg:table-cell">Received</Table.Head>
								<Table.Head>Status</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each rows as a, i (a.id)}
								<Table.Row
									data-row={i}
									data-state={nav.index === i ? 'selected' : undefined}
									class="cursor-pointer"
									onclick={() => openHref(`/leasing/applications/${a.id}`)}
									onmouseenter={() => (nav.index = i)}
								>
									<Table.Cell class="max-w-48">
										<a
											href="/leasing/applications/{a.id}"
											class="block truncate font-medium outline-none">{a.firstName} {a.lastName}</a
										>
										<span class="block truncate text-xs text-muted-foreground sm:hidden"
											>{a.propertyName ?? '—'} · {a.unitName ?? ''}</span
										>
									</Table.Cell>
									<Table.Cell class="hidden text-muted-foreground sm:table-cell"
										>{a.propertyName ? `${a.propertyName} · ${a.unitName}` : '—'}</Table.Cell
									>
									<Table.Cell class="hidden text-muted-foreground md:table-cell"
										>{formatDate(a.moveInDate, true)}</Table.Cell
									>
									<Table.Cell class="hidden text-right tabular-nums md:table-cell"
										>{formatMoney(a.monthlyIncome)}</Table.Cell
									>
									<Table.Cell class="hidden text-muted-foreground lg:table-cell"
										>{formatRelative(a.createdAt)}</Table.Cell
									>
									<Table.Cell><StatusBadge status={a.status} /></Table.Cell>
								</Table.Row>
							{:else}
								<Table.Row
									><Table.Cell colspan={6} class="py-8 text-center text-muted-foreground"
										>Nothing here.</Table.Cell
									></Table.Row
								>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="listings">
			{#if listings.length === 0}
				<Empty.Root class="border">
					<Empty.Header>
						<Empty.Media variant="icon"><Megaphone /></Empty.Media>
						<Empty.Title>No listings yet</Empty.Title>
						<Empty.Description
							>List a vacant unit to get a public page with an online application.</Empty.Description
						>
					</Empty.Header>
					<Empty.Content
						><Button onclick={() => (creating = true)}><Plus /> New listing</Button></Empty.Content
					>
				</Empty.Root>
			{:else}
				<ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{#each listings as l, i (l.id)}
						<li>
							<a
								href="/leasing/listings/{l.id}"
								data-row={i}
								onmouseenter={() => (nav.index = i)}
								class="group block overflow-x-auto rounded-lg border transition-colors hover:bg-muted/40 {nav.index ===
									i && tab === 'listings'
									? 'ring-2 ring-ring'
									: ''}"
							>
								<div class="relative aspect-[16/9] bg-muted">
									{#if l.photoId}
										<img
											src="/api/documents/{l.photoId}"
											alt=""
											loading="lazy"
											class="size-full object-cover"
										/>
									{:else}
										<div class="grid size-full place-items-center text-muted-foreground">
											<Building2 class="size-8" />
										</div>
									{/if}
									<StatusBadge status={l.status} class="absolute top-2 left-2 bg-background/90" />
								</div>
								<div class="space-y-0.5 p-3">
									<div class="flex items-baseline justify-between gap-2">
										<p class="truncate font-medium">{l.title}</p>
										<p class="shrink-0 text-sm tabular-nums">
											{formatMoney(l.rentAmount, l.currency)}
										</p>
									</div>
									<p class="truncate text-sm text-muted-foreground">
										{l.propertyName} · {l.unitName}
									</p>
									{#if l.newApplications}
										<p class="text-xs text-sky-700 dark:text-sky-400">
											{l.newApplications} new {l.newApplications === 1
												? 'application'
												: 'applications'}
										</p>
									{/if}
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</main>

<NewListingDialog bind:open={creating} />
<NewLeadDialog bind:open={creatingLead} />
