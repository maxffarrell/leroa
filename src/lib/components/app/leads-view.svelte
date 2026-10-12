<script lang="ts">
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import LeadScoreBadge from '#lib/components/app/lead-score-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { getLeads, updateLead } from '#lib/remote/crm.remote.ts';
	import { bulkSetLeadStage } from '#lib/remote/bulk.remote.ts';
	import { SvelteSet } from 'svelte/reactivity';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import BulkBar from '#lib/components/app/bulk-bar.svelte';
	import {
		followUpState,
		LEAD_SOURCE_LABELS,
		LEAD_STAGE_LABELS,
		LEAD_STAGES,
		leadName,
		OPEN_LEAD_STAGES,
		type LeadStage
	} from '#lib/leads.ts';
	import { formatDate, formatMoney, formatRelative } from '#lib/format.ts';
	import { formatTourTime, localDate } from '#lib/tours.ts';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Clock from '@lucide/svelte/icons/clock';

	let { timezone, oncreate }: { timezone: string; oncreate: () => void } = $props();

	const leads = $derived(await getLeads());
	const today = $derived(localDate(new Date(), timezone));

	let view = $state<'board' | 'table'>('board');
	let q = $state('');
	let onlyWaitlist = $state(false);
	let showClosed = $state(false);
	let dragging = $state<string | null>(null);
	let over = $state<LeadStage | null>(null);
	let moved = $state<Record<string, LeadStage>>({});
	let losing = $state<(typeof leads)[number] | null>(null);
	let lostReason = $state('');
	const picked = new SvelteSet<string>();
	const bulkStage = async (stage: string) => {
		const ids = [...picked];
		if (!ids.length) return;
		await bulkSetLeadStage({ ids, stage: stage as LeadStage });
		for (const id of ids) moved[id] = stage as LeadStage;
		picked.clear();
		toast.success(`Moved ${ids.length} lead${ids.length === 1 ? '' : 's'} to ${stage}`);
	};

	const stageOf = (l: { id: string; stage: LeadStage }) => moved[l.id] ?? l.stage;
	const filtered = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		return leads.filter(
			(l) =>
				(!onlyWaitlist || l.waitlist) &&
				(!needle ||
					[l.firstName, l.lastName, l.email, l.phone, l.propertyName]
						.filter(Boolean)
						.some((s) => s!.toLowerCase().includes(needle)))
		);
	});
	const stages = $derived(showClosed ? LEAD_STAGES : OPEN_LEAD_STAGES);
	const columns = $derived(
		stages.map((stage) => ({ stage, items: filtered.filter((l) => stageOf(l) === stage) }))
	);
	const rows = $derived(
		filtered.filter(
			(l) => showClosed || (OPEN_LEAD_STAGES as readonly string[]).includes(stageOf(l))
		)
	);
	const due = $derived(
		leads.filter(
			(l) =>
				(OPEN_LEAD_STAGES as readonly string[]).includes(l.stage) &&
				followUpState(l.nextFollowUpOn, today) === 'overdue'
		).length
	);

	async function drop(stage: LeadStage) {
		const l = leads.find((x) => x.id === dragging);
		dragging = over = null;
		if (!l || stageOf(l) === stage) return;
		if (stage === 'lost') {
			lostReason = '';
			losing = l;
			return;
		}
		await move(l, stage);
	}

	async function markLost(e: SubmitEvent) {
		e.preventDefault();
		const l = losing;
		losing = null;
		if (l) await move(l, 'lost', lostReason.trim() || null);
	}

	async function move(l: (typeof leads)[number], stage: LeadStage, reason?: string | null) {
		moved[l.id] = stage;
		try {
			await updateLead({
				id: l.id,
				stage,
				...(stage === 'lost' ? { lostReason: reason ?? null } : {})
			});
			toast.success(`${leadName(l)} moved to ${LEAD_STAGE_LABELS[stage]}`);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not move lead');
		} finally {
			delete moved[l.id];
		}
	}
</script>

{#snippet followUp(date: string | null)}
	{@const s = followUpState(date, today)}
	{#if s}
		<span
			class="inline-flex items-center gap-1 {s === 'overdue'
				? 'text-red-700 dark:text-red-400'
				: s === 'today'
					? 'text-amber-700 dark:text-amber-400'
					: ''}"
			><Clock class="size-3" />{s === 'today'
				? 'Today'
				: s === 'overdue'
					? `Overdue · ${formatDate(date, true)}`
					: formatDate(date, true)}</span
		>
	{/if}
{/snippet}

{#if leads.length === 0}
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Media variant="icon"><Users /></Empty.Media>
			<Empty.Title>No leads yet</Empty.Title>
			<Empty.Description
				>Inquiries, tour bookings and applications from your public pages show up here. You can also
				add people who call or walk in.</Empty.Description
			>
		</Empty.Header>
		<Empty.Content><Button onclick={oncreate}><Plus /> New lead</Button></Empty.Content>
	</Empty.Root>
{:else}
	<div class="mb-3 flex flex-wrap items-center gap-2">
		<div class="relative w-full sm:w-64">
			<Search
				class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input class="h-8 pl-8" placeholder="Search leads" bind:value={q} aria-label="Search leads" />
		</div>
		<ToggleGroup.Root
			type="single"
			size="sm"
			variant="outline"
			value={view}
			onValueChange={(v) => v && (view = v as typeof view)}
			aria-label="View"
		>
			<ToggleGroup.Item value="board">Board</ToggleGroup.Item>
			<ToggleGroup.Item value="table">Table</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Button
			size="sm"
			variant={onlyWaitlist ? 'secondary' : 'ghost'}
			aria-pressed={onlyWaitlist}
			onclick={() => (onlyWaitlist = !onlyWaitlist)}>Waitlist</Button
		>
		<Button
			size="sm"
			variant={showClosed ? 'secondary' : 'ghost'}
			aria-pressed={showClosed}
			onclick={() => (showClosed = !showClosed)}>Leased & lost</Button
		>
		{#if due}
			<span class="text-sm text-red-700 sm:ml-auto dark:text-red-400"
				>{due} overdue {due === 1 ? 'follow-up' : 'follow-ups'}</span
			>
		{/if}
	</div>

	{#if view === 'board'}
		<div
			class="grid snap-x snap-mandatory auto-cols-[minmax(min(15rem,80vw),1fr)] grid-flow-col gap-3 overflow-x-auto pb-2"
			role="list"
		>
			{#each columns as col (col.stage)}
				<section
					class="flex min-h-48 snap-start flex-col rounded-lg bg-muted/40 p-2 transition-colors {over ===
					col.stage
						? 'bg-muted ring-2 ring-ring/30'
						: ''}"
					aria-label={LEAD_STAGE_LABELS[col.stage]}
					role="listitem"
					ondragover={(e) => {
						e.preventDefault();
						over = col.stage;
					}}
					ondragleave={() => over === col.stage && (over = null)}
					ondrop={() => drop(col.stage)}
				>
					<header class="flex items-center gap-2 px-1.5 pb-2 text-sm font-medium">
						{LEAD_STAGE_LABELS[col.stage]}
						<span class="text-xs text-muted-foreground tabular-nums">{col.items.length}</span>
					</header>
					<ul class="flex flex-col gap-2">
						{#each col.items as l (l.id)}
							<li>
								<a
									href="/leasing/leads/{l.id}"
									draggable="true"
									ondragstart={() => (dragging = l.id)}
									ondragend={() => (dragging = over = null)}
									class="block rounded-md border bg-card p-3 shadow-xs transition hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {dragging ===
									l.id
										? 'opacity-50'
										: ''}"
								>
									<div class="flex items-start justify-between gap-2">
										<span class="text-sm leading-snug font-medium">{leadName(l)}</span>
										<span class="flex shrink-0 items-center gap-1">
											{#if l.aiScore && page.data.ai}<LeadScoreBadge
													score={l.aiScore}
													reason={l.aiScoreReason}
												/>{/if}
											{#if l.waitlist}<StatusBadge status="waitlist" />{/if}
										</span>
									</div>
									<p class="mt-0.5 truncate text-xs text-muted-foreground">
										{l.listingTitle ?? l.propertyName ?? 'Any property'}{l.budgetMax
											? ` · up to ${formatMoney(l.budgetMax)}`
											: ''}
									</p>
									<div
										class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
									>
										{#if l.nextTourAt}
											<span class="inline-flex items-center gap-1 text-sky-700 dark:text-sky-400"
												><CalendarClock class="size-3" />{formatTourTime(
													l.nextTourAt,
													timezone
												)}</span
											>
										{/if}
										{@render followUp(l.nextFollowUpOn)}
										<span class="ml-auto">{LEAD_SOURCE_LABELS[l.source]}</span>
									</div>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-8"></Table.Head>
						<Table.Head>Name</Table.Head>
						<Table.Head>Stage</Table.Head>
						<Table.Head class="hidden md:table-cell">Interested in</Table.Head>
						<Table.Head class="hidden sm:table-cell">Follow up</Table.Head>
						<Table.Head class="hidden lg:table-cell">Source</Table.Head>
						<Table.Head class="hidden lg:table-cell">Added</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as l (l.id)}
						<Table.Row class="cursor-pointer" onclick={() => goto(`/leasing/leads/${l.id}`)}>
							<Table.Cell class="w-8">
								<!-- Row click navigates; the checkbox must not. -->
								<span role="presentation" onclick={(e) => e.stopPropagation()}>
									<Checkbox
										aria-label="Select {leadName(l)}"
										checked={picked.has(l.id)}
										onCheckedChange={(c) => (c === true ? picked.add(l.id) : picked.delete(l.id))}
									/>
								</span>
							</Table.Cell>
							<Table.Cell class="max-w-48">
								<span class="flex items-center gap-1.5">
									<a href="/leasing/leads/{l.id}" class="block truncate font-medium"
										>{leadName(l)}</a
									>
									{#if l.aiScore && page.data.ai}<LeadScoreBadge
											score={l.aiScore}
											reason={l.aiScoreReason}
										/>{/if}
								</span>
								<span class="block truncate text-xs text-muted-foreground"
									>{l.email ?? l.phone ?? ''}</span
								>
							</Table.Cell>
							<Table.Cell><StatusBadge status={stageOf(l)} /></Table.Cell>
							<Table.Cell class="hidden text-muted-foreground md:table-cell"
								>{l.listingTitle ?? l.propertyName ?? '—'}</Table.Cell
							>
							<Table.Cell class="hidden text-sm text-muted-foreground sm:table-cell"
								>{@render followUp(l.nextFollowUpOn)}</Table.Cell
							>
							<Table.Cell class="hidden text-muted-foreground lg:table-cell"
								>{LEAD_SOURCE_LABELS[l.source]}</Table.Cell
							>
							<Table.Cell class="hidden text-muted-foreground lg:table-cell"
								>{formatRelative(l.createdAt)}</Table.Cell
							>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={7} class="py-8 text-center text-muted-foreground"
								>No leads match.</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
{/if}

<BulkBar
	count={picked.size}
	total={rows.length}
	onselectall={() => {
		if (picked.size === rows.length) picked.clear();
		else for (const l of rows) picked.add(l.id);
	}}
	onclear={() => picked.clear()}
>
	{#snippet actions()}
		<NativeSelect.Root
			aria-label="Move to stage"
			size="sm"
			value=""
			onchange={(e) => bulkStage(e.currentTarget.value)}
		>
			<NativeSelect.Option value="" disabled>Move to…</NativeSelect.Option>
			{#each LEAD_STAGES as s (s)}
				<NativeSelect.Option value={s}>{LEAD_STAGE_LABELS[s]}</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>
	{/snippet}
</BulkBar>

<Modal.Root open={losing !== null} onOpenChange={(o) => !o && (losing = null)}>
	<Modal.Content class="sm:max-w-sm">
		<form class="space-y-4" onsubmit={markLost}>
			<Modal.Header>
				<Modal.Title>Mark {losing ? leadName(losing) : ''} lost</Modal.Title>
				<Modal.Description>They'll leave the pipeline and any waitlist.</Modal.Description>
			</Modal.Header>
			<Field.Field>
				<Field.Label for="board-lost-reason">Reason (optional)</Field.Label>
				<Textarea
					id="board-lost-reason"
					rows={2}
					maxlength={500}
					placeholder="Rented elsewhere, over budget…"
					bind:value={lostReason}
				/>
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (losing = null)}>Cancel</Button>
				<Button type="submit" variant="destructive">Mark lost</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
