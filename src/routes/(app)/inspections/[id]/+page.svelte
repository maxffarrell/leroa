<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import {
		addInspectionItem,
		completeInspection,
		createRepairTicket,
		deleteInspection,
		deleteInspectionItem,
		getInspection,
		updateInspection,
		updateInspectionItem
	} from '#lib/remote/inspections.remote.ts';
	import {
		CONDITION_LABEL,
		KIND_LABEL,
		groupByArea,
		needsRepair,
		worsened,
		type Condition
	} from '#lib/inspections.ts';
	import { itemConditions } from '#lib/schemas.ts';
	import { formatDate } from '#lib/format.ts';
	import { cn } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import FileText from '@lucide/svelte/icons/file-text';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import Wrench from '@lucide/svelte/icons/wrench';
	import X from '@lucide/svelte/icons/x';
	import Plus from '@lucide/svelte/icons/plus';
	import MessageSquare from '@lucide/svelte/icons/message-square';

	const id = $derived(page.params.id!);
	const i = $derived(await getInspection(id));
	const editable = $derived(i.status === 'in_progress');

	type Local = { condition?: Condition | null; notes?: string | null };
	let local = $state<Record<string, Local>>({});
	const items = $derived(i.items.map((it) => ({ ...it, ...local[it.id] })));
	const groups = $derived(groupByArea(items));
	const rated = $derived(items.filter((it) => it.condition).length);
	const flagged = $derived(items.filter((it) => needsRepair(it.condition)).length);

	let cursor = $state(-1);
	let notesOpen = $state<Record<string, boolean>>({});
	let uploading = $state<string | null>(null);
	let newItem = $state<Record<string, string>>({});
	let newArea = $state('');
	let completing = $state(false);
	let busy = $state(false);
	let summary = $state<string | null>(null);
	const summaryValue = $derived(summary ?? i.summary ?? '');

	const pdf = $derived(`/api/inspections/${id}/pdf`);
	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	const tone: Record<Condition, string> = {
		good: 'data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-800 dark:data-[state=on]:text-emerald-300',
		fair: 'data-[state=on]:bg-sky-500/15 data-[state=on]:text-sky-800 dark:data-[state=on]:text-sky-300',
		poor: 'data-[state=on]:bg-amber-500/20 data-[state=on]:text-amber-800 dark:data-[state=on]:text-amber-300',
		damaged:
			'data-[state=on]:bg-red-500/15 data-[state=on]:text-red-800 dark:data-[state=on]:text-red-300',
		na: 'data-[state=on]:bg-muted data-[state=on]:text-foreground'
	};
	const badge: Record<Condition, string> = {
		good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
		fair: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
		poor: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
		damaged: 'bg-red-500/10 text-red-700 dark:text-red-400',
		na: 'bg-muted text-muted-foreground'
	};

	async function save(itemId: string, patch: Local) {
		const prev = local[itemId];
		local[itemId] = { ...prev, ...patch };
		try {
			await updateInspectionItem({ id: itemId, ...patch });
		} catch (err) {
			local[itemId] = prev ?? {};
			fail(err, 'Could not save');
		}
	}

	function rate(index: number, condition: Condition | null) {
		const it = items[index];
		if (!it || !editable) return;
		void save(it.id, { condition });
		if (condition && needsRepair(condition)) notesOpen[it.id] = true;
	}

	function onkeydown(e: KeyboardEvent) {
		if (!editable || e.metaKey || e.ctrlKey || e.altKey) return;
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
		const n = Number(e.key);
		if (e.key === 'j' || e.key === 'ArrowDown') cursor = Math.min(items.length - 1, cursor + 1);
		else if (e.key === 'k' || e.key === 'ArrowUp') cursor = Math.max(0, cursor - 1);
		else if (n >= 1 && n <= itemConditions.length && cursor >= 0) {
			rate(cursor, itemConditions[n - 1]!);
			const next = items.findIndex((it, idx) => idx > cursor && !it.condition);
			if (next >= 0) cursor = next;
		} else return;
		e.preventDefault();
		document.querySelector(`[data-item="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
	}

	async function upload(itemId: string, files: FileList | null) {
		const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (!images.length) return;
		uploading = itemId;
		try {
			const form = new FormData();
			for (const f of images) form.append('file', f);
			const res = await fetch(`/api/inspections/items/${itemId}/photos`, {
				method: 'POST',
				body: form
			});
			if (!res.ok) toast.error((await res.json().catch(() => null))?.message ?? 'Upload failed');
			await getInspection(id).refresh();
		} finally {
			uploading = null;
		}
	}

	async function addItem(e: SubmitEvent, area: string) {
		e.preventDefault();
		const label = (area === '' ? newItem['\u0000'] : newItem[area])?.trim();
		const target = area || newArea.trim();
		if (!label || !target) return;
		try {
			await addInspectionItem({ inspectionId: id, area: target, label });
			if (area) newItem[area] = '';
			else {
				newItem['\u0000'] = '';
				newArea = '';
			}
		} catch (err) {
			fail(err, 'Could not add the item');
		}
	}

	async function removeItem(itemId: string) {
		await deleteInspectionItem(itemId).catch((err) => fail(err, 'Could not remove'));
	}

	async function repair(itemId: string) {
		try {
			const t = await createRepairTicket(itemId);
			toast.success(`Request #${t.number} created`, {
				action: { label: 'Open', onClick: () => goto(`/maintenance?ticket=${t.id}`) }
			});
		} catch (err) {
			fail(err, 'Could not create the request');
		}
	}

	async function complete() {
		busy = true;
		try {
			await completeInspection({ id, summary: summaryValue || null });
			completing = false;
			toast.success('Inspection completed. The PDF report is saved to the lease.');
		} catch (err) {
			fail(err, 'Could not complete');
		} finally {
			busy = false;
		}
	}

	async function remove() {
		if (!confirm('Delete this inspection and its photos?')) return;
		try {
			await deleteInspection(id);
			await goto('/inspections');
		} catch (err) {
			fail(err, 'Could not delete');
		}
	}
</script>

<svelte:window {onkeydown} />

<PageHeader
	title="{KIND_LABEL[i.kind]} inspection"
	crumbs={[{ label: 'Inspections', href: '/inspections' }]}
>
	{#snippet actions()}
		<Button size="sm" variant="outline" href={pdf} target="_blank" rel="noopener"
			><FileText /> <span class="hidden sm:inline">PDF</span></Button
		>
		{#if editable}
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
					<DropdownMenu.Item variant="destructive" onclick={remove}
						>Delete inspection</DropdownMenu.Item
					>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/snippet}
</PageHeader>

<main class="mx-auto max-w-3xl space-y-6 p-4 pb-28 md:p-6 md:pb-28">
	<div class="space-y-1">
		<div class="flex flex-wrap items-center gap-2">
			<h1 class="text-xl font-semibold tracking-tight">
				<a href="/properties/{i.propertyId}" class="hover:underline"
					>{i.propertyName} · {i.unitName}</a
				>
			</h1>
			<StatusBadge status={i.status} />
		</div>
		<p class="text-sm text-muted-foreground">
			{#if i.tenants.length}{i.tenants.map((t) => t.name).join(', ')} ·
			{/if}{#if i.leaseId}<a href="/leases/{i.leaseId}" class="hover:underline">View lease</a> ·
			{/if}{i.status === 'completed'
				? `Completed ${formatDate(i.completedAt)}${i.completedByName ? ` by ${i.completedByName}` : ''}`
				: i.scheduledFor
					? `Scheduled ${formatDate(i.scheduledFor)}`
					: 'Not scheduled'}
		</p>
		{#if i.baseline}
			<p class="text-xs text-muted-foreground">
				Comparing with the move-in inspection from {formatDate(i.baseline.completedAt)}.
			</p>
		{/if}
	</div>

	{#if i.status === 'completed' && i.leaseId && i.kind !== 'routine'}
		<div
			class={cn(
				'flex items-start gap-2 rounded-lg border p-3 text-sm',
				i.tenantComment && 'border-amber-500/40 bg-amber-500/5'
			)}
		>
			<MessageSquare class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			{#if i.acknowledgedAt}
				<div>
					<p>Resident reviewed this report on {formatDate(i.acknowledgedAt)}.</p>
					{#if i.tenantComment}<p class="mt-1 text-muted-foreground">“{i.tenantComment}”</p>{/if}
				</div>
			{:else}
				<p class="text-muted-foreground">
					Waiting for the resident to review this report in their portal.
				</p>
			{/if}
		</div>
	{/if}

	{#if editable}
		<p class="hidden text-xs text-muted-foreground md:block">
			Keyboard: <kbd>J</kbd>/<kbd>K</kbd> move between items, <kbd>1</kbd>–<kbd>5</kbd> rate Good, Fair,
			Poor, Damaged or N/A and jump to the next unrated item.
		</p>
	{/if}

	{#each groups as g (g.area)}
		<section class="space-y-2">
			<h2 class="flex items-baseline gap-2 text-sm font-medium">
				{g.area}
				<span class="text-xs font-normal text-muted-foreground"
					>{g.items.filter((it) => it.condition).length}/{g.items.length}</span
				>
			</h2>
			<ul class="divide-y rounded-lg border">
				{#each g.items as it (it.id)}
					{@const index = items.indexOf(it)}
					{@const worse = worsened(it.before?.condition, it.condition)}
					<li
						data-item={index}
						class={cn(
							'space-y-2 px-3 py-2.5',
							cursor === index && 'bg-muted/50',
							worse && 'bg-red-500/5'
						)}
					>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
							<div class="min-w-0 flex-1 basis-40">
								<p class="text-sm font-medium">{it.label}</p>
								{#if it.before}
									<p class="text-xs text-muted-foreground">
										Move-in: {it.before.condition ? CONDITION_LABEL[it.before.condition] : '—'}
										{#if it.before.notes}· {it.before.notes}{/if}
										{#if worse}<span class="font-medium text-red-600 dark:text-red-400">
												· Worse than move-in</span
											>{/if}
									</p>
								{/if}
							</div>
							{#if editable}
								<ToggleGroup.Root
									type="single"
									variant="outline"
									size="sm"
									class="w-full sm:w-auto"
									value={it.condition ?? ''}
									onValueChange={(v) => {
										cursor = index;
										rate(index, (v || null) as Condition | null);
									}}
									aria-label="Condition of {it.label}"
								>
									{#each itemConditions as c (c)}
										<ToggleGroup.Item value={c} class={cn('flex-1 px-2.5 text-xs', tone[c])}
											>{CONDITION_LABEL[c]}</ToggleGroup.Item
										>
									{/each}
								</ToggleGroup.Root>
							{:else if it.condition}
								<span
									class={cn('rounded-full px-2 py-0.5 text-xs font-medium', badge[it.condition])}
									>{CONDITION_LABEL[it.condition]}</span
								>
							{/if}
						</div>

						{#if editable && (notesOpen[it.id] || it.notes)}
							<Textarea
								rows={2}
								placeholder="What did you see?"
								aria-label="Notes for {it.label}"
								value={it.notes ?? ''}
								onchange={(e) => save(it.id, { notes: e.currentTarget.value.trim() || null })}
							/>
						{:else if it.notes}
							<p class="text-sm text-muted-foreground">{it.notes}</p>
						{/if}

						{#if it.photos.length || editable || needsRepair(it.condition)}
							<div class="flex flex-wrap items-center gap-2">
								{#each it.photos as p (p.id)}
									<a
										href="/api/documents/{p.id}"
										target="_blank"
										rel="noreferrer"
										class="size-14 overflow-hidden rounded-md bg-muted"
										><img
											src="/api/documents/{p.id}"
											alt={p.name}
											loading="lazy"
											class="size-full object-cover"
										/></a
									>
								{/each}
								{#if editable}
									<label
										class="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
									>
										<ImagePlus class="size-3.5" />{uploading === it.id ? 'Uploading…' : 'Photo'}
										<input
											type="file"
											accept="image/*"
											capture="environment"
											multiple
											class="sr-only"
											disabled={uploading !== null}
											onchange={(e) => {
												void upload(it.id, e.currentTarget.files);
												e.currentTarget.value = '';
											}}
										/>
									</label>
									{#if !notesOpen[it.id] && !it.notes}
										<Button
											size="sm"
											variant="ghost"
											class="h-8 px-2 text-xs text-muted-foreground"
											onclick={() => (notesOpen[it.id] = true)}><StickyNote /> Note</Button
										>
									{/if}
								{/if}
								{#if needsRepair(it.condition)}
									<Button
										size="sm"
										variant="ghost"
										class="h-8 px-2 text-xs"
										onclick={() => repair(it.id)}><Wrench /> Create request</Button
									>
								{/if}
								{#if editable}
									<Button
										size="icon-sm"
										variant="ghost"
										class="ml-auto text-muted-foreground"
										aria-label="Remove {it.label}"
										onclick={() => removeItem(it.id)}><X /></Button
									>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
				{#if editable}
					<li class="px-3 py-2">
						<form class="flex gap-2" onsubmit={(e) => addItem(e, g.area)}>
							<Input
								class="h-8"
								placeholder="Add an item to {g.area}"
								maxlength={200}
								bind:value={() => newItem[g.area] ?? '', (v) => (newItem[g.area] = v)}
							/>
							<Button
								type="submit"
								size="sm"
								variant="ghost"
								disabled={!newItem[g.area]?.trim()}
								aria-label="Add item"><Plus /></Button
							>
						</form>
					</li>
				{/if}
			</ul>
		</section>
	{/each}

	{#if editable}
		<form class="space-y-2 rounded-lg border border-dashed p-3" onsubmit={(e) => addItem(e, '')}>
			<h2 class="text-sm font-medium">Add a room or area</h2>
			<div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
				<Input class="h-8" placeholder="Area, e.g. Patio" maxlength={200} bind:value={newArea} />
				<Input
					class="h-8"
					placeholder="First item, e.g. Railing"
					maxlength={200}
					bind:value={() => newItem['\u0000'] ?? '', (v) => (newItem['\u0000'] = v)}
				/>
				<Button
					type="submit"
					size="sm"
					variant="outline"
					disabled={!newArea.trim() || !newItem['\u0000']?.trim()}>Add</Button
				>
			</div>
		</form>

		<section class="space-y-2">
			<h2 class="text-sm font-medium">Summary</h2>
			<Textarea
				rows={3}
				placeholder="Overall condition, anything the next inspector should know"
				value={summaryValue}
				oninput={(e) => (summary = e.currentTarget.value)}
				onchange={(e) =>
					updateInspection({ id, summary: e.currentTarget.value.trim() || null }).catch((err) =>
						fail(err, 'Could not save')
					)}
			/>
		</section>
	{:else if i.summary}
		<section class="space-y-1">
			<h2 class="text-sm font-medium">Summary</h2>
			<p class="text-sm whitespace-pre-line text-muted-foreground">{i.summary}</p>
		</section>
	{/if}
</main>

{#if editable}
	<div
		class="sticky bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6"
	>
		<div class="mx-auto flex max-w-3xl items-center gap-3">
			<div class="min-w-0 flex-1 space-y-1">
				<p class="text-xs text-muted-foreground tabular-nums">
					{rated} of {items.length} rated{#if flagged}<span class="text-red-600 dark:text-red-400">
							· {flagged} need attention</span
						>{/if}
				</p>
				<Progress value={items.length ? (rated / items.length) * 100 : 0} class="h-1.5" />
			</div>
			<Button disabled={rated < items.length || !items.length} onclick={() => (completing = true)}
				>Complete</Button
			>
		</div>
	</div>
{/if}

<Modal.Root bind:open={completing}>
	<Modal.Content class="sm:max-w-md">
		<Modal.Header>
			<Modal.Title>Complete inspection?</Modal.Title>
			<Modal.Description>
				The report is locked and saved as a PDF on the {i.leaseId
					? 'lease'
					: 'unit'}.{#if i.leaseId && i.kind !== 'routine'}
					Residents on the lease are emailed to review it in their portal.{/if}
			</Modal.Description>
		</Modal.Header>
		{#if flagged}
			<p class="text-sm">
				{flagged} item{flagged === 1 ? ' is' : 's are'} poor or damaged. You can open maintenance requests
				for them afterwards too.
			</p>
		{/if}
		<Modal.Footer>
			<Button variant="ghost" onclick={() => (completing = false)}>Cancel</Button>
			<Button disabled={busy} onclick={complete}>{busy ? 'Completing…' : 'Complete'}</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
