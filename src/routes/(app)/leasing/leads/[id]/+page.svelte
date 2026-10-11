<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import LeadScoreBadge from '#lib/components/app/lead-score-badge.svelte';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import ScheduleTourDialog from '#lib/components/app/schedule-tour-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import {
		addLeadNote,
		deleteLead,
		getLead,
		getLeasingSettings,
		updateLead,
		updateTour
	} from '#lib/remote/crm.remote.ts';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import { getMembers } from '#lib/remote/workspace.remote.ts';
	import {
		followUpState,
		LEAD_NOTE_KINDS,
		LEAD_SOURCE_LABELS,
		LEAD_SOURCES,
		LEAD_STAGE_LABELS,
		LEAD_STAGES,
		leadName,
		TOUR_KIND_LABELS,
		type LeadSource,
		type LeadStage
	} from '#lib/leads.ts';
	import { addDays, formatDate, formatRelative } from '#lib/format.ts';
	import { formatTourTime, localDate } from '#lib/tours.ts';
	import { toast } from 'svelte-sonner';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import PhoneCall from '@lucide/svelte/icons/phone-call';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import Inbox from '@lucide/svelte/icons/inbox';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';

	const id = $derived(page.params.id!);
	const l = $derived(await getLead(id));
	const settings = $derived(await getLeasingSettings());
	const properties = $derived(await getProperties());
	const members = $derived(await getMembers());
	const name = $derived(leadName(l));
	const today = $derived(localDate(new Date(), settings.timezone));
	const isAdmin = $derived(['owner', 'admin'].includes(page.data.role ?? ''));
	const closed = $derived(l.stage === 'leased' || l.stage === 'lost');
	const follow = $derived(followUpState(l.nextFollowUpOn, today));

	type Kind = (typeof LEAD_NOTE_KINDS)[number];
	const kindLabels: Record<Kind, string> = {
		note: 'Note',
		call: 'Call',
		email: 'Email',
		text: 'Text'
	};
	const kindIcons = {
		note: StickyNote,
		call: PhoneCall,
		email: Mail,
		text: MessageSquare,
		inquiry: Inbox
	};

	let kind = $state<Kind>('note');
	let body = $state('');
	let followOn = $state<string | null>(null);
	let posting = $state(false);
	let touring = $state(false);
	let losing = $state(false);
	let lostReason = $state('');

	const timeline = $derived(
		[
			...l.notes.map((n) => ({ ...n, type: 'note' as const, at: new Date(n.createdAt) })),
			...l.events
				.filter((e) => e.action !== 'created')
				.map((e) => ({ ...e, type: 'event' as const, at: new Date(e.createdAt) }))
		].sort((a, b) => b.at.getTime() - a.at.getTime())
	);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	async function patch(input: Omit<Parameters<typeof updateLead>[0], 'id'>, done?: string) {
		try {
			await updateLead({ id, ...input });
			if (done) toast.success(done);
		} catch (err) {
			fail(err, 'Could not save');
		}
	}

	async function moveTo(stage: LeadStage) {
		if (stage === 'lost') {
			lostReason = '';
			losing = true;
			return;
		}
		await patch({ stage }, `Moved to ${LEAD_STAGE_LABELS[stage]}`);
	}

	async function markLost(e: SubmitEvent) {
		e.preventDefault();
		await patch({ stage: 'lost', lostReason: lostReason || null }, 'Marked lost');
		losing = false;
	}

	async function post(e: SubmitEvent) {
		e.preventDefault();
		if (!body.trim()) return;
		posting = true;
		try {
			await addLeadNote({
				leadId: id,
				kind,
				body,
				...(followOn !== null ? { nextFollowUpOn: followOn || null } : {})
			});
			body = '';
			followOn = null;
			toast.success(kind === 'note' ? 'Note added' : `${kindLabels[kind]} logged`);
		} catch (err) {
			fail(err, 'Could not save');
		} finally {
			posting = false;
		}
	}

	async function remove() {
		if (!confirm(`Delete ${name} and their history? This can't be undone.`)) return;
		try {
			await deleteLead(id);
			await goto('/leasing');
		} catch (err) {
			fail(err, 'Could not delete');
		}
	}

	async function tourStatus(tourId: string, status: 'completed' | 'no_show' | 'cancelled') {
		try {
			await updateTour({ id: tourId, status });
		} catch (err) {
			fail(err, 'Could not update tour');
		}
	}

	const intOrNull = (s: string) => (s === '' ? null : Math.max(0, Math.round(Number(s))));
</script>

<PageHeader title={name} crumbs={[{ label: 'Leasing', href: '/leasing' }]}>
	{#snippet actions()}
		{#if !closed}
			<Button size="sm" variant="outline" onclick={() => (touring = true)}
				><CalendarPlus /> <span class="hidden sm:inline">Book tour</span></Button
			>
		{/if}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}<Button size="sm" {...props}
						><ArrowRight /> <span class="hidden sm:inline">Move to</span></Button
					>{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#each LEAD_STAGES as s (s)}
					<DropdownMenu.Item disabled={s === l.stage} onclick={() => moveTo(s)}
						>{LEAD_STAGE_LABELS[s]}</DropdownMenu.Item
					>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
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
				{#if l.email}
					<DropdownMenu.Item onclick={() => (location.href = `mailto:${l.email}`)}
						><Mail /> Email</DropdownMenu.Item
					>
				{/if}
				{#if l.phone}
					<DropdownMenu.Item onclick={() => (location.href = `tel:${l.phone}`)}
						><Phone /> Call</DropdownMenu.Item
					>
				{/if}
				{#if isAdmin}
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive" onclick={remove}>Delete lead</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/snippet}
</PageHeader>

<main class="grid gap-6 p-4 md:p-6 lg:grid-cols-[1fr_20rem]">
	<div class="min-w-0 space-y-6">
		<div class="space-y-1">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="text-xl font-semibold tracking-tight">{name}</h1>
				<StatusBadge status={l.stage} />
				{#if l.waitlist}<StatusBadge status="waitlist" />{/if}
				{#if l.aiScore && page.data.ai}<LeadScoreBadge
						score={l.aiScore}
						reason={l.aiScoreReason}
					/>{/if}
			</div>
			{#if l.aiScoreReason && page.data.ai}
				<p class="text-xs text-muted-foreground">AI intake score — {l.aiScoreReason}</p>
			{/if}
			<p class="text-sm text-muted-foreground">
				{LEAD_SOURCE_LABELS[l.source]}{l.sourceDetail ? ` (${l.sourceDetail})` : ''} · added {formatRelative(
					l.createdAt
				)}{l.lastContactedAt ? ` · last contacted ${formatRelative(l.lastContactedAt)}` : ''}
			</p>
			<div class="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
				{#if l.email}<a
						href="mailto:{l.email}"
						class="inline-flex items-center gap-1.5 hover:underline"
						><Mail class="size-3.5" />{l.email}</a
					>{/if}
				{#if l.phone}<a
						href="tel:{l.phone}"
						class="inline-flex items-center gap-1.5 hover:underline"
						><Phone class="size-3.5" />{l.phone}</a
					>{/if}
			</div>
			{#if l.stage === 'lost' && l.lostReason}
				<p class="text-sm text-muted-foreground">Lost: {l.lostReason}</p>
			{/if}
		</div>

		{#if l.applicationId || l.tenantId}
			<div class="flex flex-wrap gap-2">
				{#if l.applicationId}
					<Button size="sm" variant="outline" href="/leasing/applications/{l.applicationId}"
						>Application{l.applicationStatus ? ` · ${l.applicationStatus}` : ''}</Button
					>
				{/if}
				{#if l.tenantId}
					<Button size="sm" variant="outline" href="/tenants/{l.tenantId}">Tenant record</Button>
				{/if}
			</div>
		{/if}

		<Card.Root>
			<Card.Content>
				<form onsubmit={post} class="space-y-3">
					<ToggleGroup.Root
						type="single"
						size="sm"
						variant="outline"
						value={kind}
						onValueChange={(v) => v && (kind = v as Kind)}
						aria-label="What happened"
					>
						{#each LEAD_NOTE_KINDS as k (k)}
							{@const Icon = kindIcons[k]}
							<ToggleGroup.Item value={k}><Icon /> {kindLabels[k]}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
					<Textarea
						rows={3}
						placeholder={kind === 'note'
							? 'Add a note'
							: `What was said on the ${kindLabels[kind].toLowerCase()}?`}
						aria-label="Details"
						bind:value={body}
						onkeydown={(e) => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
								e.currentTarget.form?.requestSubmit();
						}}
					/>
					<div class="flex flex-wrap items-center gap-2">
						<span class="text-sm text-muted-foreground">Next follow-up</span>
						{#each [['Tomorrow', 1], ['3 days', 3], ['1 week', 7]] as const as [label, days] (label)}
							{@const d = addDays(today, days)}
							<Button
								type="button"
								size="sm"
								variant={followOn === d ? 'secondary' : 'ghost'}
								aria-pressed={followOn === d}
								onclick={() => (followOn = followOn === d ? null : d)}>{label}</Button
							>
						{/each}
						<Input
							type="date"
							class="h-8 w-auto"
							aria-label="Follow-up date"
							value={followOn ?? ''}
							oninput={(e) => (followOn = e.currentTarget.value || null)}
						/>
						<Button type="submit" size="sm" class="ml-auto" disabled={posting || !body.trim()}
							>{kind === 'note' ? 'Add note' : `Log ${kindLabels[kind].toLowerCase()}`}</Button
						>
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<section>
			<h2 class="mb-3 text-sm font-medium">Activity</h2>
			<ol class="space-y-4">
				{#each timeline as item (item.id)}
					<li class="flex gap-3">
						{#if item.type === 'note'}
							{@const Icon = kindIcons[item.kind]}
							<span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted"
								><Icon class="size-3.5" /></span
							>
							<div class="min-w-0 flex-1">
								<p class="text-xs text-muted-foreground">
									{item.kind === 'inquiry'
										? 'From the prospect'
										: `${item.kind === 'note' ? 'Note' : kindLabels[item.kind as Kind]} by ${item.authorName ?? 'someone'}`}
									· {formatRelative(item.createdAt)}
								</p>
								<p class="mt-0.5 text-sm whitespace-pre-line">{item.body}</p>
							</div>
						{:else}
							<span class="mt-1.5 ml-2.5 size-2 shrink-0 rounded-full bg-muted-foreground/40"
							></span>
							<p class="min-w-0 flex-1 text-sm text-muted-foreground">
								{item.summary}{item.actorName ? ` · ${item.actorName}` : ''} · {formatRelative(
									item.createdAt
								)}
							</p>
						{/if}
					</li>
				{:else}
					<li class="text-sm text-muted-foreground">Nothing yet.</li>
				{/each}
			</ol>
		</section>
	</div>

	<aside class="space-y-4">
		<Card.Root size="sm">
			<Card.Header><Card.Title>Follow-up</Card.Title></Card.Header>
			<Card.Content class="space-y-2">
				<Input
					type="date"
					aria-label="Next follow-up"
					value={l.nextFollowUpOn ?? ''}
					onchange={(e) =>
						patch({ nextFollowUpOn: e.currentTarget.value || null }, 'Follow-up set')}
				/>
				{#if follow === 'overdue'}
					<p class="text-xs text-red-700 dark:text-red-400">
						Overdue since {formatDate(l.nextFollowUpOn)}
					</p>
				{:else if follow === 'today'}
					<p class="text-xs text-amber-700 dark:text-amber-400">Due today</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root size="sm">
			<Card.Header>
				<Card.Title>Tours</Card.Title>
				{#if !closed}
					<Card.Action
						><Button size="sm" variant="ghost" onclick={() => (touring = true)}>Book</Button
						></Card.Action
					>
				{/if}
			</Card.Header>
			<Card.Content>
				{#if l.tours.length}
					<ul class="space-y-3">
						{#each l.tours as t (t.id)}
							<li class="flex items-start gap-2 text-sm">
								<CalendarClock class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<div class="min-w-0 flex-1">
									<p class="font-medium">{formatTourTime(t.startsAt, settings.timezone)}</p>
									<p class="truncate text-xs text-muted-foreground">
										{t.listingTitle ?? t.propertyName} · {TOUR_KIND_LABELS[t.kind]}{t.agentName
											? ` · ${t.agentName}`
											: ''}
									</p>
								</div>
								{#if t.status === 'scheduled'}
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
											<DropdownMenu.Item onclick={() => tourStatus(t.id, 'completed')}
												>Mark done</DropdownMenu.Item
											>
											<DropdownMenu.Item onclick={() => tourStatus(t.id, 'no_show')}
												>No-show</DropdownMenu.Item
											>
											<DropdownMenu.Item
												variant="destructive"
												onclick={() => tourStatus(t.id, 'cancelled')}>Cancel</DropdownMenu.Item
											>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{:else}
									<StatusBadge status={t.status} />
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-muted-foreground">No tours yet.</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root size="sm">
			<Card.Header><Card.Title>Details</Card.Title></Card.Header>
			<Card.Content>
				<Field.Group class="gap-3">
					<Field.Field>
						<Field.Label>Interested in</Field.Label>
						<Select.Root
							type="single"
							value={l.propertyId ?? ''}
							onValueChange={(v) => patch({ propertyId: v || null })}
						>
							<Select.Trigger class="w-full"
								>{l.listingTitle ?? l.propertyName ?? 'Any property'}</Select.Trigger
							>
							<Select.Content class="max-h-72">
								<Select.Item value="" label="Any property" />
								{#each properties as p (p.id)}
									<Select.Item value={p.id} label={p.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label>Assigned to</Field.Label>
						<Select.Root
							type="single"
							value={l.assignedTo ?? ''}
							onValueChange={(v) => patch({ assignedTo: v || null })}
						>
							<Select.Trigger class="w-full">{l.assigneeName ?? 'Nobody'}</Select.Trigger>
							<Select.Content>
								<Select.Item value="" label="Nobody" />
								{#each members as m (m.userId)}
									<Select.Item value={m.userId} label={m.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<div class="grid grid-cols-2 gap-3">
						<Field.Field>
							<Field.Label for="ld-move">Move-in</Field.Label>
							<Input
								id="ld-move"
								type="date"
								value={l.moveInDate ?? ''}
								onchange={(e) => patch({ moveInDate: e.currentTarget.value || null })}
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label for="ld-beds">Bedrooms</Field.Label>
							<Input
								id="ld-beds"
								type="number"
								inputmode="numeric"
								min={0}
								value={l.bedrooms ?? ''}
								onchange={(e) => patch({ bedrooms: intOrNull(e.currentTarget.value) })}
							/>
						</Field.Field>
					</div>
					<Field.Field>
						<Field.Label for="ld-budget">Budget / mo</Field.Label>
						{#key l.budgetMax}
							<div
								onfocusout={(e) => {
									const v = (e.currentTarget as HTMLElement).querySelector('input')?.value ?? '';
									const n = Number.parseFloat(v.replace(/[,$\s]/g, ''));
									const cents = Number.isFinite(n) ? Math.round(n * 100) : null;
									if (cents !== l.budgetMax) void patch({ budgetMax: cents });
								}}
							>
								<MoneyInput id="ld-budget" value={l.budgetMax} />
							</div>
						{/key}
					</Field.Field>
					<Field.Field>
						<Field.Label>Source</Field.Label>
						<Select.Root
							type="single"
							value={l.source}
							onValueChange={(v) => patch({ source: v as LeadSource })}
						>
							<Select.Trigger class="w-full">{LEAD_SOURCE_LABELS[l.source]}</Select.Trigger>
							<Select.Content>
								{#each LEAD_SOURCES as s (s)}
									<Select.Item value={s} label={LEAD_SOURCE_LABELS[s]} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field orientation="horizontal">
						<Switch
							id="ld-wait"
							checked={l.waitlist}
							onCheckedChange={(v) =>
								patch({ waitlist: v }, v ? 'Added to the waitlist' : 'Removed from the waitlist')}
						/>
						<Field.Label for="ld-wait" class="font-normal">On the waitlist</Field.Label>
					</Field.Field>
				</Field.Group>
			</Card.Content>
		</Card.Root>
		{#if l.message}
			<Card.Root size="sm">
				<Card.Header><Card.Description>First message</Card.Description></Card.Header>
				<Card.Content><p class="text-sm whitespace-pre-line">{l.message}</p></Card.Content>
			</Card.Root>
		{/if}
	</aside>
</main>

<ScheduleTourDialog
	bind:open={touring}
	leadId={id}
	leadName={name}
	propertyId={l.propertyId}
	listingId={l.listingId}
/>

<Modal.Root bind:open={losing}>
	<Modal.Content class="sm:max-w-sm">
		<form onsubmit={markLost} class="space-y-4">
			<Modal.Header>
				<Modal.Title>Mark {name} lost</Modal.Title>
				<Modal.Description>They'll leave the pipeline and any waitlist.</Modal.Description>
			</Modal.Header>
			<Field.Field>
				<Field.Label for="lost-reason">Reason (optional)</Field.Label>
				<Input
					id="lost-reason"
					placeholder="e.g. Rented elsewhere, over budget"
					bind:value={lostReason}
				/>
			</Field.Field>
			<Modal.Footer><Button type="submit" variant="destructive">Mark lost</Button></Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
