<script lang="ts">
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { toast } from 'svelte-sonner';
	import { getTours, updateTour } from '#lib/remote/crm.remote.ts';
	import { leadName, TOUR_KIND_LABELS } from '#lib/leads.ts';
	import { formatTourTime, localDate } from '#lib/tours.ts';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';

	let { timezone }: { timezone: string } = $props();
	const tours = $derived(await getTours());
	const today = $derived(localDate(new Date(), timezone));
	let showPast = $state(false);

	type Tour = (typeof tours)[number];
	const dayOf = (t: Tour) => localDate(new Date(t.startsAt), timezone);
	const group = (list: Tour[]) => {
		const out: { date: string; items: Tour[] }[] = [];
		for (const t of list) {
			const d = dayOf(t);
			const last = out.at(-1);
			if (last?.date === d) last.items.push(t);
			else out.push({ date: d, items: [t] });
		}
		return out;
	};
	const upcoming = $derived(group(tours.filter((t) => dayOf(t) >= today)));
	const past = $derived(group(tours.filter((t) => dayOf(t) < today).reverse()));

	function dayLabel(date: string) {
		if (date === today) return 'Today';
		const d = new Date(`${date}T12:00:00Z`);
		return d.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	async function setStatus(t: Tour, status: 'scheduled' | 'completed' | 'no_show' | 'cancelled') {
		try {
			await updateTour({ id: t.id, status });
			toast.success(
				{
					scheduled: 'Tour reopened',
					completed: 'Marked done',
					no_show: 'Marked no-show',
					cancelled: 'Tour cancelled'
				}[status]
			);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not update');
		}
	}
</script>

{#snippet day(g: { date: string; items: Tour[] })}
	<section>
		<h3 class="mb-2 text-sm font-medium {g.date === today ? '' : 'text-muted-foreground'}">
			{dayLabel(g.date)}
		</h3>
		<ul class="divide-y rounded-lg border">
			{#each g.items as t (t.id)}
				<li class="flex items-center gap-3 px-3 py-2.5 sm:px-4">
					<span class="w-16 shrink-0 text-sm font-medium tabular-nums"
						>{formatTourTime(t.startsAt, timezone, false)}</span
					>
					<div class="min-w-0 flex-1">
						<a
							href="/leasing/leads/{t.leadId}"
							class="block truncate text-sm font-medium hover:underline"
							>{leadName({ firstName: t.leadFirstName, lastName: t.leadLastName })}</a
						>
						<p class="truncate text-xs text-muted-foreground">
							{t.listingTitle ?? t.propertyName} · {TOUR_KIND_LABELS[t.kind]}{t.agentName
								? ` · ${t.agentName}`
								: ''}{t.selfBooked ? ' · Booked online' : ''}
						</p>
					</div>
					{#if t.status !== 'scheduled'}<StatusBadge status={t.status} />{/if}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}<Button
									size="icon-sm"
									variant="ghost"
									aria-label="Tour actions"
									{...props}><Ellipsis /></Button
								>{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end">
							{#if t.status === 'scheduled'}
								<DropdownMenu.Item onclick={() => setStatus(t, 'completed')}
									>Mark done</DropdownMenu.Item
								>
								<DropdownMenu.Item onclick={() => setStatus(t, 'no_show')}
									>No-show</DropdownMenu.Item
								>
								<DropdownMenu.Separator />
								<DropdownMenu.Item variant="destructive" onclick={() => setStatus(t, 'cancelled')}
									>Cancel tour</DropdownMenu.Item
								>
							{:else}
								<DropdownMenu.Item onclick={() => setStatus(t, 'scheduled')}
									>Back to scheduled</DropdownMenu.Item
								>
							{/if}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</li>
			{/each}
		</ul>
	</section>
{/snippet}

{#if tours.length === 0}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon"><CalendarDays /></Empty.Media>
			<Empty.Title>No tours booked</Empty.Title>
			<Empty.Description
				>Book a tour from a lead, or turn on online booking in Settings → Leasing so prospects can
				pick a time themselves.</Empty.Description
			>
		</Empty.Header>
		<Empty.Content
			><Button variant="outline" href="/settings/leasing">Tour settings</Button></Empty.Content
		>
	</Empty.Root>
{:else}
	<div class="max-w-3xl space-y-6">
		{#each upcoming as g (g.date)}
			{@render day(g)}
		{:else}
			<p class="text-sm text-muted-foreground">Nothing coming up.</p>
		{/each}
		{#if past.length}
			<Button size="sm" variant="ghost" onclick={() => (showPast = !showPast)}
				>{showPast ? 'Hide' : 'Show'} past tours</Button
			>
			{#if showPast}
				{#each past as g (g.date)}
					{@render day(g)}
				{/each}
			{/if}
		{/if}
		<p class="text-xs text-muted-foreground">Times in {timezone.replace('_', ' ')}.</p>
	</div>
{/if}
