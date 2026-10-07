<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import TicketForm from '#lib/components/app/ticket-form.svelte';
	import { getTurns, startTurn, updateTurn } from '#lib/remote/operations.remote.ts';
	import { getUnits } from '#lib/remote/portfolio.remote.ts';
	import { createListing } from '#lib/remote/listings.remote.ts';
	import { turnStages } from '#lib/schemas.ts';
	import { formatDate, formatRelative, todayISO } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import type { Turn } from '#lib/server/services/turns.ts';
	import Wrench from '@lucide/svelte/icons/wrench';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Plus from '@lucide/svelte/icons/plus';

	const turns = $derived(await getTurns());
	const allUnits = $derived(await getUnits());

	let dragging = $state<string | null>(null);
	let over = $state<string | null>(null);
	let selected = $state<Turn | null>(null);
	let starting = $state(false);
	let addingWork = $state(false);
	let listingPending = $state(false);
	let notes = $derived(selected?.notes ?? '');

	const labels: Record<(typeof turnStages)[number], string> = {
		move_out: 'Moved out',
		make_ready: 'Make ready',
		listed: 'Listed',
		done: 'Done'
	};

	const columns = $derived(
		turnStages.map((stage) => ({
			stage,
			items: turns.filter((t) => t.stage === stage)
		}))
	);

	// Units that could start a turn: vacant or on notice, with no open turn.
	const startable = $derived(
		allUnits.filter(
			(u) =>
				(u.status === 'vacant' || u.status === 'notice') &&
				!turns.some((t) => t.unitId === u.id && t.stage !== 'done')
		)
	);
	const selectedDone = $derived(selected?.stage === 'done');

	const errMsg = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	async function patch(
		id: string,
		data: {
			stage?: Turn['stage'];
			moveOutOn?: string | null;
			targetReadyOn?: string | null;
			notes?: string | null;
		}
	) {
		await updateTurn({ id, ...data }).catch((err) => toast.error(errMsg(err, 'Update failed')));
	}

	function drop(stage: (typeof turnStages)[number]) {
		const t = turns.find((x) => x.id === dragging);
		if (t && t.stage !== stage) {
			void patch(t.id, { stage });
			if (selected?.id === t.id) selected = { ...t, stage };
		}
		dragging = over = null;
	}

	let newUnit = $state('');
	let newMoveOut = $state(todayISO());
	let newReady = $state('');
	let newNotes = $state('');
	let pending = $state(false);

	async function submitStart(e: SubmitEvent) {
		e.preventDefault();
		if (!newUnit) return toast.error('Pick a unit');
		pending = true;
		try {
			await startTurn({
				unitId: newUnit,
				moveOutOn: newMoveOut || null,
				targetReadyOn: newReady || null,
				notes: newNotes || null
			});
			toast.success('Turn started');
			starting = false;
			newUnit = '';
			newReady = newNotes = '';
		} catch (err) {
			toast.error(errMsg(err, 'Could not start the turn'));
		} finally {
			pending = false;
		}
	}

	async function makeListing(t: Turn) {
		listingPending = true;
		try {
			const { id } = await createListing({ unitId: t.unitId });
			await goto(`/leasing/listings/${id}`);
		} catch (err) {
			toast.error(errMsg(err, 'Could not create the listing'));
		} finally {
			listingPending = false;
		}
	}
</script>

<div class="flex flex-wrap items-center gap-3">
	<Button size="sm" onclick={() => (starting = true)} disabled={!startable.length}
		><Plus /> Start a turn</Button
	>
	<p class="ml-auto hidden text-xs text-muted-foreground md:block">
		Drag cards between stages. A lease starting on the unit finishes the turn.
	</p>
</div>

<div class="grid flex-1 auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
	{#each columns as col (col.stage)}
		<section
			class="flex min-h-48 flex-col rounded-lg bg-muted/40 p-2 transition-colors {over === col.stage
				? 'bg-muted ring-2 ring-ring/30'
				: ''}"
			aria-label={labels[col.stage]}
			ondragover={(e) => {
				e.preventDefault();
				over = col.stage;
			}}
			ondragleave={() => over === col.stage && (over = null)}
			ondrop={() => drop(col.stage)}
		>
			<header class="flex items-center gap-2 px-1.5 pb-2 text-sm font-medium">
				{labels[col.stage]}
				<span class="text-xs text-muted-foreground tabular-nums">{col.items.length}</span>
			</header>
			<ul class="flex flex-col gap-2">
				{#each col.items as t (t.id)}
					<li>
						<button
							type="button"
							draggable="true"
							ondragstart={() => (dragging = t.id)}
							ondragend={() => (dragging = over = null)}
							onclick={() => (selected = t)}
							class="w-full rounded-md border bg-card p-3 text-left shadow-xs transition hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {dragging ===
							t.id
								? 'opacity-50'
								: ''}"
						>
							<span class="block text-sm leading-snug font-medium"
								>{t.propertyName} · {t.unitName}</span
							>
							<div
								class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
							>
								{#if t.moveOutOn}<span>Out {formatDate(t.moveOutOn, true)}</span>{/if}
								{#if t.targetReadyOn}
									<span
										class={t.targetReadyOn < todayISO() && t.stage !== 'done'
											? 'font-medium text-red-600 dark:text-red-400'
											: ''}>ready by {formatDate(t.targetReadyOn, true)}</span
									>
								{/if}
								<span class="ml-auto shrink-0">{formatRelative(t.createdAt)}</span>
							</div>
							{#if t.openTickets > 0}
								<p class="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
									<Wrench class="size-3 shrink-0" />{t.openTickets} open
								</p>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<Sheet.Root open={!!selected} onOpenChange={(o) => !o && (selected = null)}>
	<Sheet.Content class="w-full gap-0 sm:max-w-md">
		{#if selected}
			<Sheet.Header>
				<Sheet.Description>{selected.propertyName} · {selected.unitName}</Sheet.Description>
				<Sheet.Title class="text-lg">Unit turn</Sheet.Title>
			</Sheet.Header>
			<div class="space-y-4 overflow-y-auto px-4 pb-4">
				<Field.Field>
					<Field.Label>Stage</Field.Label>
					<Select.Root
						type="single"
						value={selected.stage}
						onValueChange={(v) => patch(selected!.id, { stage: v as Turn['stage'] })}
					>
						<Select.Trigger class="w-full">{labels[selected.stage]}</Select.Trigger>
						<Select.Content
							>{#each turnStages as s (s)}<Select.Item value={s}>{labels[s]}</Select.Item
								>{/each}</Select.Content
						>
					</Select.Root>
				</Field.Field>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="turn-out">Moved out</Field.Label>
						<Input
							id="turn-out"
							type="date"
							value={selected.moveOutOn ?? ''}
							onchange={(e) => patch(selected!.id, { moveOutOn: e.currentTarget.value || null })}
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="turn-ready">Ready by</Field.Label>
						<Input
							id="turn-ready"
							type="date"
							value={selected.targetReadyOn ?? ''}
							onchange={(e) =>
								patch(selected!.id, { targetReadyOn: e.currentTarget.value || null })}
						/>
					</Field.Field>
				</div>
				{#if selected.targetReadyOn && selected.targetReadyOn < todayISO() && !selectedDone}
					<p class="text-sm font-medium text-red-600 dark:text-red-400">
						Past its ready-by date — {formatDate(selected.targetReadyOn)} has passed.
					</p>
				{/if}
				<div class="flex flex-wrap gap-2">
					<Button size="sm" variant="outline" onclick={() => (addingWork = true)}
						><Wrench /> New work order</Button
					>
					{#if !selected.listed}
						<Button
							size="sm"
							variant="outline"
							disabled={listingPending}
							onclick={() => makeListing(selected!)}
							><Megaphone />{listingPending ? 'Creating…' : 'List this unit'}</Button
						>
					{/if}
				</div>
				{#if selected.listed}
					<p class="text-sm text-muted-foreground">
						This unit has a published listing. The stage moves to “listed” automatically — you can
						still pull it back while work continues.
					</p>
				{/if}
				<Field.Field>
					<Field.Label for="turn-notes">Notes</Field.Label>
					<Textarea
						id="turn-notes"
						rows={4}
						placeholder="Paint, carpet, lock change…"
						bind:value={notes}
						onchange={() =>
							notes !== (selected?.notes ?? '') && patch(selected!.id, { notes: notes || null })}
					/>
				</Field.Field>
				<p class="text-xs text-muted-foreground">
					Started {formatRelative(selected.createdAt)} · unit is {selected.unitStatus}
					{#if selected.openTickets > 0}
						· {selected.openTickets} open work {selected.openTickets === 1
							? 'order'
							: 'orders'}{/if}
				</p>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<TicketForm
	bind:open={addingWork}
	propertyId={selected?.propertyId ?? null}
	unitId={selected?.unitId ?? null}
/>

<Dialog.Root bind:open={starting}>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submitStart} class="space-y-5">
			<Dialog.Header><Dialog.Title>Start a unit turn</Dialog.Title></Dialog.Header>
			<Field.Group class="gap-4">
				<Field.Field>
					<Field.Label>Unit</Field.Label>
					<Select.Root type="single" bind:value={newUnit}>
						<Select.Trigger class="w-full"
							>{newUnit
								? (allUnits.find((u) => u.id === newUnit)?.name ?? 'Select')
								: 'Select'}</Select.Trigger
						>
						<Select.Content class="max-h-72">
							{#each startable as u (u.id)}<Select.Item value={u.id}
									>{u.propertyName} · {u.name}</Select.Item
								>{/each}
						</Select.Content>
					</Select.Root>
					{#if !startable.length}
						<p class="text-xs text-muted-foreground">
							Only vacant or notice units without a running turn can start one.
						</p>
					{/if}
				</Field.Field>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="new-out">Moved out</Field.Label>
						<Input id="new-out" type="date" bind:value={newMoveOut} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="new-ready">Ready by</Field.Label>
						<Input id="new-ready" type="date" bind:value={newReady} />
					</Field.Field>
				</div>
				<Field.Field>
					<Field.Label for="new-notes">Notes</Field.Label>
					<Textarea id="new-notes" rows={3} bind:value={newNotes} />
				</Field.Field>
			</Field.Group>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (starting = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !newUnit}
					>{pending ? 'Starting…' : 'Start turn'}</Button
				>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
