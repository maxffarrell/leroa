<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { toast } from 'svelte-sonner';
	import { formatDate, todayISO } from '#lib/format.ts';
	import { CLAUSE_KINDS, CLAUSE_KIND_LABELS, type ClauseKind } from '#lib/schemas.ts';
	import {
		addClause,
		addCriticalDate,
		getClauses,
		getCriticalDates,
		removeClause,
		removeCriticalDate,
		setDateDone
	} from '#lib/remote/commercial.remote.ts';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';

	const { leaseId }: { leaseId: string } = $props();

	const clauses = $derived(await getClauses(leaseId));
	const dates = $derived(await getCriticalDates(leaseId));

	let addingClause = $state(false);
	let fKind = $state<ClauseKind>('other');
	let fTitle = $state('');
	let fBody = $state('');

	let addingDate = $state(false);
	let dLabel = $state('');
	let dDate = $state('');
	let dClause = $state('');
	let dRemind = $state('30');

	async function saveClause(e: SubmitEvent) {
		e.preventDefault();
		if (!fTitle.trim()) return;
		try {
			await addClause({ leaseId, kind: fKind, title: fTitle.trim(), body: fBody.trim() || null });
			toast.success('Clause added');
			addingClause = false;
			fTitle = fBody = '';
			fKind = 'other';
		} catch {
			toast.error('Could not add clause');
		}
	}

	async function saveDate(e: SubmitEvent) {
		e.preventDefault();
		if (!dLabel.trim() || !dDate) return;
		try {
			await addCriticalDate({
				leaseId,
				clauseId: dClause || null,
				label: dLabel.trim(),
				date: dDate,
				remindDays: Number(dRemind) || 0
			});
			toast.success('Critical date added');
			addingDate = false;
			dLabel = dDate = '';
			dClause = '';
			dRemind = '30';
		} catch {
			toast.error('Could not add date');
		}
	}
</script>

<section class="space-y-2">
	<div class="flex items-center gap-2">
		<h2 class="text-sm font-medium">Clauses & critical dates</h2>
		<div class="ml-auto flex gap-2">
			<Button size="sm" variant="outline" onclick={() => (addingClause = true)}
				><Plus /> Clause</Button
			>
			<Button size="sm" variant="outline" onclick={() => (addingDate = true)}
				><CalendarClock /> Date</Button
			>
		</div>
	</div>
	{#if !clauses.length && !dates.length}
		<div class="rounded-lg border py-6 text-center text-sm text-muted-foreground">
			No clauses or critical dates yet — renewal options, escalations and ROFR windows live here.
		</div>
	{/if}
	{#if clauses.length}
		<div class="grid gap-2 sm:grid-cols-2">
			{#each clauses as c (c.id)}
				<div class="rounded-lg border p-3">
					<div class="flex items-start gap-2">
						<div class="min-w-0">
							<Badge variant="secondary" class="mr-1.5">{CLAUSE_KIND_LABELS[c.kind]}</Badge>
							<span class="text-sm font-medium">{c.title}</span>
							{#if c.body}<p class="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">
									{c.body}
								</p>{/if}
						</div>
						<Button
							size="icon-xs"
							variant="ghost"
							class="ml-auto shrink-0"
							aria-label="Delete clause"
							onclick={() =>
								confirmDelete({
									title: `Delete "${c.title}"?`,
									description: 'Linked critical dates are kept but lose the clause link.',
									onConfirm: async () => {
										await removeClause(c.id).catch(() => toast.error('Could not delete'));
										getClauses(leaseId).refresh();
										getCriticalDates(leaseId).refresh();
									}
								})}><Trash2 /></Button
						>
					</div>
				</div>
			{/each}
		</div>
	{/if}
	{#if dates.length}
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<tbody>
					{#each dates as d (d.id)}
						{@const overdue = !d.doneAt && d.date < todayISO()}
						<tr class="border-b last:border-0 {d.doneAt ? 'opacity-50' : ''}">
							<td class="w-8 px-3 py-2">
								<span role="presentation" onclick={(e) => e.stopPropagation()}>
									<Checkbox
										checked={!!d.doneAt}
										aria-label="Mark date done"
										onCheckedChange={(v) =>
											setDateDone({ id: d.id, done: !!v }).catch(() =>
												toast.error('Could not update')
											)}
									/>
								</span>
							</td>
							<td class="px-3 py-2 tabular-nums">
								<span class={overdue ? 'font-medium text-red-600 dark:text-red-400' : ''}
									>{formatDate(d.date, true)}</span
								>
							</td>
							<td class="px-3 py-2">
								{d.label}
								{#if d.clauseTitle}<span class="ml-1 text-xs text-muted-foreground"
										>· {d.clauseTitle}</span
									>{/if}
								{#if overdue}<Badge variant="destructive" class="ml-1.5">Due</Badge>{/if}
							</td>
							<td class="px-3 py-2 text-right text-xs whitespace-nowrap text-muted-foreground">
								remind {d.remindDays}d before
								<Button
									size="icon-xs"
									variant="ghost"
									aria-label="Delete date"
									onclick={() =>
										confirmDelete({
											title: `Delete "${d.label}"?`,
											description: 'Reminders for this date stop.',
											onConfirm: async () => {
												await removeCriticalDate(d.id).catch(() => toast.error('Could not delete'));
												getCriticalDates(leaseId).refresh();
											}
										})}><Trash2 /></Button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<Modal.Root bind:open={addingClause}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={saveClause}>
			<Modal.Header>
				<Modal.Title>New clause</Modal.Title>
				<Modal.Description
					>A named provision on this lease — mostly used on commercial deals.</Modal.Description
				>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Kind</Field.Label>
				<NativeSelect.Root bind:value={fKind} class="w-full">
					{#each CLAUSE_KINDS as k (k)}
						<NativeSelect.Option value={k}>{CLAUSE_KIND_LABELS[k]}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Field.Field>
				<Field.Label>Title</Field.Label>
				<Input bind:value={fTitle} placeholder="5-year renewal option at market" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Text</Field.Label>
				<Textarea
					bind:value={fBody}
					rows={4}
					placeholder="Paste or summarize the clause language…"
				/>
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (addingClause = false)}
					>Cancel</Button
				>
				<Button type="submit" disabled={!fTitle.trim()}>Add clause</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<Modal.Root bind:open={addingDate}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={saveDate}>
			<Modal.Header>
				<Modal.Title>New critical date</Modal.Title>
				<Modal.Description
					>Managers get a reminder inside the lead window — in the inbox and by email.</Modal.Description
				>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Label</Field.Label>
				<Input bind:value={dLabel} placeholder="Renewal option exercise deadline" />
			</Field.Field>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Date</Field.Label>
					<Input type="date" bind:value={dDate} min={todayISO()} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Remind days before</Field.Label>
					<Input type="number" min={0} max={365} bind:value={dRemind} />
				</Field.Field>
			</div>
			{#if clauses.length}
				<Field.Field>
					<Field.Label>Linked clause</Field.Label>
					<NativeSelect.Root bind:value={dClause} class="w-full">
						<NativeSelect.Option value="">None</NativeSelect.Option>
						{#each clauses as c (c.id)}
							<NativeSelect.Option value={c.id}>{c.title}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
				</Field.Field>
			{/if}
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (addingDate = false)}>Cancel</Button>
				<Button type="submit" disabled={!dLabel.trim() || !dDate}>Add date</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
