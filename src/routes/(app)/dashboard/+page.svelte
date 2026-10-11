<script lang="ts">
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { page } from '$app/state';
	import { getDashboard, seedDemo } from '#lib/remote/workspace.remote.ts';
	import { aiInsights } from '#lib/remote/ai.remote.ts';
	import { toast } from 'svelte-sonner';
	import { formatMoney, formatRelative, formatDate, todayISO } from '#lib/format.ts';
	import { formatTourTime } from '#lib/tours.ts';
	import { leadName } from '#lib/leads.ts';
	import Building2 from '@lucide/svelte/icons/building-2';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	const d = $derived(await getDashboard());
	const insights = $derived(page.data.enterprise ? await aiInsights().catch(() => []) : []);
	let seeding = $state(false);

	async function demo() {
		seeding = true;
		try {
			await seedDemo();
			toast.success('Demo portfolio loaded');
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not load demo data'
			);
		} finally {
			seeding = false;
		}
	}
	const collectedPct = $derived(d.rent.due ? Math.round((d.rent.collected / d.rent.due) * 100) : 0);
	const occupancyPct = $derived(
		d.occupancy.total ? Math.round((d.occupancy.occupied / d.occupancy.total) * 100) : 0
	);
	const overdueTotal = $derived(d.rent.overdue.reduce((s, r) => s + r.balance, 0));
	const monthLabel = $derived(
		new Date(`${d.month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
	);
</script>

<PageHeader title="Dashboard" />

<main class="space-y-6 p-4 md:p-6">
	{#if d.occupancy.total === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Building2 /></Empty.Media>
				<Empty.Title>Add your first property</Empty.Title>
				<Empty.Description
					>Start with a building and its units. Tenants, leases and rent come next.</Empty.Description
				>
			</Empty.Header>
			<Empty.Content class="flex-row justify-center gap-2">
				<Button href="/properties?new=1">Add property</Button>
				<Button variant="outline" disabled={seeding} onclick={demo}
					>{seeding ? 'Loading…' : 'Explore with demo data'}</Button
				>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
			<Card.Root>
				<Card.Header>
					<Card.Description>Collected · {monthLabel}</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{formatMoney(d.rent.collected)}</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-2">
					<Progress value={collectedPct} />
					<p class="text-xs text-muted-foreground">
						{collectedPct}% of {formatMoney(d.rent.due)} · {d.rent.paidCount}/{d.rent.count} paid
					</p>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Overdue</Card.Description>
					<Card.Title
						class="text-2xl tabular-nums {overdueTotal ? 'text-red-600 dark:text-red-400' : ''}"
						>{formatMoney(overdueTotal)}</Card.Title
					>
				</Card.Header>
				<Card.Content
					><p class="text-xs text-muted-foreground">
						{d.rent.overdue.length}
						{d.rent.overdue.length === 1 ? 'charge' : 'charges'} past due
					</p></Card.Content
				>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Occupancy</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{occupancyPct}%</Card.Title>
				</Card.Header>
				<Card.Content
					><p class="text-xs text-muted-foreground">
						{d.occupancy.occupied} of {d.occupancy.total} units · {d.occupancy.vacant} vacant
					</p></Card.Content
				>
			</Card.Root>
			<Card.Root>
				<Card.Header>
					<Card.Description>Open maintenance</Card.Description>
					<Card.Title class="text-2xl tabular-nums">{d.openTickets.length}</Card.Title>
				</Card.Header>
				<Card.Content
					><p class="text-xs text-muted-foreground">
						{d.urgentTickets} urgent · {d.openTurns}
						{d.openTurns === 1 ? 'turn' : 'turns'} running
					</p></Card.Content
				>
			</Card.Root>
		</div>

		{#if insights.length}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each insights as i (i.title)}
					<a
						href={i.href}
						class="group rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25"
					>
						<p class="flex items-center gap-1.5 text-sm font-medium">
							<Sparkles class="size-3.5 text-primary" />{i.title}
							<ArrowRight
								class="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
							/>
						</p>
						<p class="mt-1 text-xs text-muted-foreground">{i.body}</p>
					</a>
				{/each}
			</div>
		{/if}

		<div class="grid gap-4 lg:grid-cols-3">
			<Card.Root class="lg:col-span-2">
				<Card.Header class="flex-row items-center justify-between">
					<Card.Title>Needs attention</Card.Title>
					<Button variant="ghost" size="sm" href="/rent?filter=overdue"
						>Rent roll <ArrowRight /></Button
					>
				</Card.Header>
				<Card.Content class="px-0">
					{#if d.rent.overdue.length === 0 && d.openTickets.length === 0 && d.followUps.length === 0 && d.toursToday.length === 0 && d.insuranceAlerts.length === 0}
						<p class="px-6 text-sm text-muted-foreground">You're all caught up.</p>
					{:else}
						<ul class="divide-y">
							{#each d.toursToday as t (t.id)}
								<li>
									<a
										href="/leasing/leads/{t.leadId}"
										class="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50"
									>
										<StatusBadge status="tour" />
										<span class="min-w-0 flex-1 truncate text-sm"
											><span class="font-medium"
												>Tour with {leadName({
													firstName: t.leadFirstName,
													lastName: t.leadLastName
												})}</span
											>
											· {t.propertyName}</span
										>
										<span class="text-sm tabular-nums"
											>{formatTourTime(t.startsAt, d.timezone, false)}</span
										>
									</a>
								</li>
							{/each}
							{#each d.followUps as f (f.id)}
								<li>
									<a
										href="/leasing/leads/{f.id}"
										class="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50"
									>
										<StatusBadge status="follow_up" />
										<span class="min-w-0 flex-1 truncate text-sm"
											><span class="font-medium">Follow up with {leadName(f)}</span>{f.propertyName
												? ` · ${f.propertyName}`
												: ''}</span
										>
										<span class="hidden w-20 text-right text-xs text-muted-foreground sm:block"
											>{formatDate(f.nextFollowUpOn, true)}</span
										>
									</a>
								</li>
							{/each}
							{#each d.insuranceAlerts as v (v.id)}
								<li>
									<a
										href="/vendors/{v.id}"
										class="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50"
									>
										<StatusBadge
											status={v.insuranceExpiresOn! < todayISO() ? 'overdue' : 'notice'}
										/>
										<span class="min-w-0 flex-1 truncate text-sm"
											><span class="font-medium">{v.name}</span> · insurance {v.insuranceExpiresOn! <
											todayISO()
												? 'lapsed'
												: 'expires'}
											{formatDate(v.insuranceExpiresOn, true)}</span
										>
									</a>
								</li>
							{/each}
							{#each d.rent.overdue.slice(0, 6) as r (r.id)}
								<li>
									<a
										href="/leases/{r.leaseId}"
										class="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50"
									>
										<StatusBadge status="overdue" />
										<span class="min-w-0 flex-1 truncate text-sm"
											><span class="font-medium">{r.tenants || 'No tenant'}</span> · {r.propertyName}
											{r.unitName}</span
										>
										<span class="text-sm font-medium tabular-nums"
											>{formatMoney(r.balance, r.currency)}</span
										>
										<span class="hidden w-20 text-right text-xs text-muted-foreground sm:block"
											>due {formatDate(r.dueDate, true)}</span
										>
									</a>
								</li>
							{/each}
							{#each d.openTickets as t (t.id)}
								<li>
									<a
										href="/maintenance?ticket={t.id}"
										class="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/50"
									>
										<StatusBadge
											status={t.priority === 'urgent' || t.priority === 'high'
												? t.priority
												: t.status}
										/>
										<span class="min-w-0 flex-1 truncate text-sm"
											><span class="font-medium">#{t.number} {t.title}</span> · {t.propertyName}{t.unitName
												? ` ${t.unitName}`
												: ''}</span
										>
										<span class="hidden w-20 text-right text-xs text-muted-foreground sm:block"
											>{formatRelative(t.createdAt)}</span
										>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Header><Card.Title>Activity</Card.Title></Card.Header>
				<Card.Content>
					{#if d.feed.length === 0}
						<p class="text-sm text-muted-foreground">No activity yet.</p>
					{:else}
						<ol class="space-y-3">
							{#each d.feed as a (a.id)}
								<li class="text-sm">
									<p class="leading-snug">{a.summary}</p>
									<p class="text-xs text-muted-foreground">
										{a.actorName ?? 'System'} · {formatRelative(a.createdAt)}
									</p>
								</li>
							{/each}
						</ol>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</main>
