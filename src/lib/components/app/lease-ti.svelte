<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { toast } from 'svelte-sonner';
	import { formatDate, formatMoney, todayISO } from '#lib/format.ts';
	import { TI_STATUSES, TI_STATUS_LABELS, type TiStatus } from '#lib/schemas.ts';
	import {
		addTiItem,
		getTiItems,
		removeTiItem,
		updateTiItem
	} from '#lib/remote/commercial.remote.ts';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Hammer from '@lucide/svelte/icons/hammer';

	const { leaseId }: { leaseId: string } = $props();

	const items = $derived(await getTiItems(leaseId));
	const budget = $derived(items.reduce((s, i) => s + i.budgetAmount, 0));
	const actual = $derived(items.reduce((s, i) => s + i.actualAmount, 0));

	let adding = $state(false);
	let fName = $state('');
	let fBudget = $state<number | null>(null);
	let fDue = $state('');
	let fNotes = $state('');

	let editingActual = $state('');
	let aAmount = $state<number | null>(null);

	const tone = (s: TiStatus) =>
		s === 'complete'
			? ('default' as const)
			: s === 'in_progress'
				? ('secondary' as const)
				: ('outline' as const);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!fName.trim()) return;
		try {
			await addTiItem({
				leaseId,
				name: fName.trim(),
				budgetAmount: fBudget ?? 0,
				dueDate: fDue || null,
				notes: fNotes.trim() || null
			});
			toast.success('TI item added');
			adding = false;
			fName = fNotes = fDue = '';
			fBudget = null;
		} catch {
			toast.error('Could not add item');
		}
	}

	async function setStatus(id: string, status: TiStatus) {
		await updateTiItem({ id, status }).catch(() => toast.error('Could not update'));
	}

	async function saveActual(e: SubmitEvent) {
		e.preventDefault();
		const id = editingActual;
		await updateTiItem({ id, actualAmount: aAmount ?? 0 }).catch(() =>
			toast.error('Could not save')
		);
		editingActual = '';
	}
</script>

<section class="space-y-2">
	<div class="flex items-center gap-2">
		<h2 class="text-sm font-medium">Tenant improvements</h2>
		{#if items.length}
			<span class="text-xs text-muted-foreground">
				budget {formatMoney(budget)} · spent {formatMoney(actual)}
				{#if actual > budget}<Badge variant="destructive" class="ml-1">over budget</Badge>{/if}
			</span>
		{/if}
		<Button size="sm" variant="outline" class="ml-auto" onclick={() => (adding = true)}
			><Plus /> TI item</Button
		>
	</div>
	{#if !items.length}
		<div class="rounded-lg border py-6 text-center text-sm text-muted-foreground">
			No TI items — track allowance budget vs actual build-out spend here.
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<tbody>
					{#each items as i (i.id)}
						<tr class="border-b last:border-0 {i.status === 'complete' ? 'opacity-60' : ''}">
							<td class="px-3 py-2">
								<span class="font-medium">{i.name}</span>
								{#if i.notes}<span class="block text-xs text-muted-foreground">{i.notes}</span>{/if}
							</td>
							<td class="px-3 py-2 whitespace-nowrap">
								<Badge variant={tone(i.status)}>{TI_STATUS_LABELS[i.status]}</Badge>
								{#if i.dueDate && i.status !== 'complete'}
									<span
										class="ml-1 text-xs tabular-nums {i.dueDate < todayISO()
											? 'text-red-600 dark:text-red-400'
											: 'text-muted-foreground'}">due {formatDate(i.dueDate, true)}</span
									>
								{/if}
							</td>
							<td class="px-3 py-2 text-right whitespace-nowrap tabular-nums">
								{formatMoney(i.actualAmount)}
								<span class="text-xs text-muted-foreground">/ {formatMoney(i.budgetAmount)}</span>
							</td>
							<td class="w-10 px-2 py-2 text-right">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}<Button
												size="icon-xs"
												variant="ghost"
												aria-label="TI item actions"
												{...props}><Ellipsis /></Button
											>{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										{#each TI_STATUSES as s (s)}
											{#if s !== i.status}
												<DropdownMenu.Item onclick={() => setStatus(i.id, s)}
													>Mark {TI_STATUS_LABELS[s].toLowerCase()}</DropdownMenu.Item
												>
											{/if}
										{/each}
										<DropdownMenu.Item
											onclick={() => {
												editingActual = i.id;
												aAmount = i.actualAmount;
											}}>Set actual spend…</DropdownMenu.Item
										>
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											variant="destructive"
											onclick={() =>
												confirmDelete({
													title: `Delete "${i.name}"?`,
													description: 'The budget and spend record go with it.',
													onConfirm: async () => {
														await removeTiItem(i.id).catch(() => toast.error('Could not delete'));
														getTiItems(leaseId).refresh();
													}
												})}>Delete</DropdownMenu.Item
										>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<Modal.Root bind:open={adding}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={save}>
			<Modal.Header>
				<Modal.Title>New TI item</Modal.Title>
				<Modal.Description
					>A scope of tenant-improvement work with an allowance budget.</Modal.Description
				>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Item</Field.Label>
				<Input bind:value={fName} placeholder="Demising wall + electrical rough-in" />
			</Field.Field>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label>Allowance budget</Field.Label>
					<MoneyInput bind:value={fBudget} />
				</Field.Field>
				<Field.Field>
					<Field.Label>Due</Field.Label>
					<Input type="date" bind:value={fDue} />
				</Field.Field>
			</div>
			<Field.Field>
				<Field.Label>Notes</Field.Label>
				<Input bind:value={fNotes} placeholder="Optional" />
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (adding = false)}>Cancel</Button>
				<Button type="submit" disabled={!fName.trim()}><Hammer /> Add item</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<Modal.Root open={editingActual !== ''} onOpenChange={(o) => !o && (editingActual = '')}>
	<Modal.Content class="sm:max-w-xs">
		<form class="space-y-4" onsubmit={saveActual}>
			<Modal.Header>
				<Modal.Title>Actual spend</Modal.Title>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Amount</Field.Label>
				<MoneyInput bind:value={aAmount} required />
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (editingActual = '')}>Cancel</Button>
				<Button type="submit">Save</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
