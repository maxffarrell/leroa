<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import {
		createSchedule,
		getAssets,
		getSchedules,
		runScheduleNow,
		updateSchedule
	} from '#lib/remote/operations.remote.ts';
	import { getProperties, getUnits } from '#lib/remote/portfolio.remote.ts';
	import { getVendors } from '#lib/remote/vendors.remote.ts';
	import { getMembers } from '#lib/remote/workspace.remote.ts';
	import { getTickets } from '#lib/remote/maintenance.remote.ts';
	import { ticketPriorities } from '#lib/schemas.ts';
	import { describeInterval, isDue, PM_INTERVALS } from '#lib/pm.ts';
	import { addDays, formatDate, todayISO } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import type { ScheduleRow } from '#lib/server/services/schedules.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Play from '@lucide/svelte/icons/play';
	import Pencil from '@lucide/svelte/icons/pencil';
	import StatusBadge from '#lib/components/app/status-badge.svelte';

	const schedules = $derived(await getSchedules());
	const today = todayISO();
	let showPaused = $state(false);
	const shown = $derived(schedules.filter((s) => showPaused || s.enabled));

	let editing = $state<ScheduleRow | null>(null);
	let creating = $state(false);
	const dialogOpen = $derived(creating || !!editing);
	const setOpen = (o: boolean) => {
		if (!o) {
			creating = false;
			editing = null;
		}
	};

	const properties = $derived(dialogOpen ? await getProperties() : []);
	const units = $derived(dialogOpen ? await getUnits() : []);
	const assets = $derived(dialogOpen ? await getAssets() : []);
	const vendors = $derived(dialogOpen ? await getVendors(false) : []);
	const members = $derived(dialogOpen ? await getMembers() : []);

	// Form state
	let fTitle = $state('');
	let fProperty = $state('');
	let fUnit = $state('');
	let fAsset = $state('');
	let fVendor = $state('');
	let fAssignee = $state('');
	let fPriority = $state<'low' | 'normal' | 'high' | 'urgent'>('normal');
	let fEvery = $state(1);
	let fInterval = $state<'weeks' | 'months' | 'years'>('months');
	let fNext = $state('');
	let fLead = $state(7);
	let fDesc = $state('');
	let pending = $state(false);

	$effect(() => {
		if (dialogOpen) {
			fTitle = editing?.title ?? '';
			fProperty = editing?.propertyId ?? '';
			fUnit = editing?.unitId ?? '';
			fAsset = editing?.assetId ?? '';
			fVendor = editing?.vendorId ?? '';
			fAssignee = editing?.assigneeId ?? '';
			fPriority = editing?.priority ?? 'normal';
			fEvery = editing?.every ?? 1;
			fInterval = editing?.interval ?? 'months';
			fNext = editing?.nextRunOn ?? addDays(today, 7);
			fLead = editing?.leadDays ?? 7;
			fDesc = editing?.description ?? '';
		}
	});

	const propUnits = $derived(units.filter((u) => u.propertyId === fProperty));
	const propAssets = $derived(
		assets.filter(
			(a) =>
				!a.archivedAt && a.propertyId === fProperty && (!fUnit || !a.unitId || a.unitId === fUnit)
		)
	);
	const selName = <T extends { id: string; name?: string | null }>(list: T[], id: string) =>
		list.find((x) => x.id === id)?.name;

	const errMsg = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			if (editing) {
				await updateSchedule({
					id: editing.id,
					title: fTitle,
					unitId: fUnit || null,
					assetId: fAsset || null,
					vendorId: fVendor || null,
					assigneeId: fAssignee || null,
					priority: fPriority,
					every: fEvery,
					interval: fInterval,
					nextRunOn: fNext,
					leadDays: fLead,
					description: fDesc || null
				});
				toast.success('Schedule updated');
			} else {
				await createSchedule({
					propertyId: fProperty,
					unitId: fUnit || null,
					assetId: fAsset || null,
					vendorId: fVendor || null,
					assigneeId: fAssignee || null,
					title: fTitle,
					priority: fPriority,
					every: fEvery,
					interval: fInterval,
					nextRunOn: fNext,
					leadDays: fLead,
					description: fDesc || null
				});
				toast.success('Schedule created');
			}
			setOpen(false);
		} catch (err) {
			toast.error(errMsg(err, 'Could not save the schedule'));
		} finally {
			pending = false;
		}
	}

	async function toggle(s: ScheduleRow, enabled: boolean) {
		await updateSchedule({ id: s.id, enabled }).catch((err) =>
			toast.error(errMsg(err, 'Update failed'))
		);
	}

	async function runNow(s: ScheduleRow) {
		try {
			const t = await runScheduleNow(s.id);
			void getTickets().refresh();
			toast.success(`Work order #${t.number} created`);
		} catch (err) {
			toast.error(errMsg(err, 'Could not create the work order'));
		}
	}
</script>

<div class="flex flex-wrap items-center gap-3">
	<Button size="sm" onclick={() => (creating = true)}><Plus /> New schedule</Button>
	<label class="flex items-center gap-2 text-sm text-muted-foreground"
		><input type="checkbox" bind:checked={showPaused} class="accent-primary" /> Show paused</label
	>
	<p class="ml-auto hidden text-xs text-muted-foreground md:block">
		The daily job issues a work order once a run's lead time opens.
	</p>
</div>

{#if shown.length === 0}
	<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
		No preventive schedules yet — recurring work like filter changes, inspections and servicing
		lives here.
	</p>
{:else}
	<div class="overflow-x-auto rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Schedule</Table.Head>
					<Table.Head class="hidden sm:table-cell">Where</Table.Head>
					<Table.Head class="hidden md:table-cell">Repeats</Table.Head>
					<Table.Head>Next run</Table.Head>
					<Table.Head class="hidden lg:table-cell">Vendor</Table.Head>
					<Table.Head class="w-10"><span class="sr-only">On</span></Table.Head>
					<Table.Head class="w-24"><span class="sr-only">Actions</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each shown as s (s.id)}
					<Table.Row class={s.enabled ? '' : 'opacity-55'}>
						<Table.Cell>
							<p class="font-medium">{s.title}</p>
							<p class="text-xs text-muted-foreground sm:hidden">
								{s.propertyName}{s.unitName ? ` · ${s.unitName}` : ''}
							</p>
							{#if s.priority !== 'normal'}<StatusBadge status={s.priority} class="mt-1" />{/if}
						</Table.Cell>
						<Table.Cell class="hidden sm:table-cell"
							>{s.propertyName}{s.unitName ? ` · ${s.unitName}` : ''}{s.assetName
								? ` — ${s.assetName}`
								: ''}</Table.Cell
						>
						<Table.Cell class="hidden whitespace-nowrap md:table-cell"
							>{describeInterval(s.every, s.interval)}{s.leadDays
								? ` · ${s.leadDays}d lead`
								: ''}</Table.Cell
						>
						<Table.Cell class="whitespace-nowrap">
							{#if s.enabled && isDue(s.nextRunOn, s.leadDays, today)}
								<span class="font-medium text-red-600 dark:text-red-400"
									>Due — runs at the next check</span
								>
							{:else}{formatDate(s.nextRunOn, true)}{/if}
							{#if s.lastRunOn}
								<p class="text-xs text-muted-foreground">last {formatDate(s.lastRunOn, true)}</p>
							{/if}
						</Table.Cell>
						<Table.Cell class="hidden lg:table-cell">{s.vendorName ?? '—'}</Table.Cell>
						<Table.Cell>
							<Switch
								checked={s.enabled}
								onCheckedChange={(v) => toggle(s, v)}
								aria-label="Enable schedule"
							/>
						</Table.Cell>
						<Table.Cell>
							<div class="flex justify-end gap-1">
								<Button
									variant="ghost"
									size="icon"
									title="Issue work order now"
									disabled={!s.enabled}
									onclick={() => runNow(s)}><Play /></Button
								>
								<Button variant="ghost" size="icon" title="Edit" onclick={() => (editing = s)}
									><Pencil /></Button
								>
							</div>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<Modal.Root open={dialogOpen} onOpenChange={setOpen}>
	<Modal.Content class="sm:max-w-xl">
		<form onsubmit={submit} class="space-y-5">
			<Modal.Header
				><Modal.Title>{editing ? 'Edit schedule' : 'New preventive schedule'}</Modal.Title
				></Modal.Header
			>
			<Field.Group class="gap-4">
				<Field.Field>
					<Field.Label for="sc-title">What should happen?</Field.Label>
					<Input id="sc-title" placeholder="Replace HVAC filters" required bind:value={fTitle} />
				</Field.Field>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label>Property</Field.Label>
						<Select.Root
							type="single"
							bind:value={fProperty}
							onValueChange={() => {
								fUnit = '';
								fAsset = '';
							}}
							disabled={!!editing}
						>
							<Select.Trigger class="w-full"
								>{selName(properties, fProperty) ?? 'Select'}</Select.Trigger
							>
							<Select.Content class="max-h-72"
								>{#each properties as p (p.id)}<Select.Item value={p.id}>{p.name}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label>Unit</Field.Label>
						<Select.Root type="single" bind:value={fUnit} disabled={!fProperty}>
							<Select.Trigger class="w-full"
								>{selName(propUnits, fUnit) ?? 'Whole property'}</Select.Trigger
							>
							<Select.Content class="max-h-72">
								<Select.Item value="">Whole property</Select.Item>
								{#each propUnits as u (u.id)}<Select.Item value={u.id}>{u.name}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label>Asset</Field.Label>
						<Select.Root type="single" bind:value={fAsset} disabled={!fProperty}>
							<Select.Trigger class="w-full">{selName(propAssets, fAsset) ?? 'None'}</Select.Trigger
							>
							<Select.Content class="max-h-72">
								<Select.Item value="">None</Select.Item>
								{#each propAssets as a (a.id)}<Select.Item value={a.id}>{a.name}</Select.Item
									>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label>Vendor</Field.Label>
						<Select.Root type="single" bind:value={fVendor}>
							<Select.Trigger class="w-full">{selName(vendors, fVendor) ?? 'None'}</Select.Trigger>
							<Select.Content class="max-h-72">
								<Select.Item value="">None</Select.Item>
								{#each vendors as v (v.id)}<Select.Item value={v.id}>{v.name}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label>Assignee</Field.Label>
						<Select.Root type="single" bind:value={fAssignee}>
							<Select.Trigger class="w-full"
								>{members.find((m) => m.userId === fAssignee)?.name ?? 'Nobody'}</Select.Trigger
							>
							<Select.Content class="max-h-72">
								<Select.Item value="">Nobody</Select.Item>
								{#each members as m (m.userId)}<Select.Item value={m.userId}>{m.name}</Select.Item
									>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label>Priority</Field.Label>
						<Select.Root type="single" bind:value={fPriority}>
							<Select.Trigger class="w-full capitalize">{fPriority}</Select.Trigger>
							<Select.Content
								>{#each ticketPriorities as p (p)}<Select.Item value={p} class="capitalize"
										>{p}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="sc-every">Repeats</Field.Label>
						<div class="flex gap-2">
							<span class="self-center text-sm text-muted-foreground">every</span>
							<Input
								id="sc-every"
								type="number"
								min={1}
								max={52}
								class="w-20"
								bind:value={fEvery}
							/>
							<Select.Root type="single" bind:value={fInterval}>
								<Select.Trigger class="w-28 capitalize">{fInterval}</Select.Trigger>
								<Select.Content
									>{#each PM_INTERVALS as i (i)}<Select.Item value={i} class="capitalize"
											>{i}</Select.Item
										>{/each}</Select.Content
								>
							</Select.Root>
						</div>
					</Field.Field>
					<div class="grid grid-cols-2 gap-3">
						<Field.Field>
							<Field.Label for="sc-next">Next service on</Field.Label>
							<Input id="sc-next" type="date" required bind:value={fNext} />
						</Field.Field>
						<Field.Field>
							<Field.Label for="sc-lead">Lead (days)</Field.Label>
							<Input id="sc-lead" type="number" min={0} max={90} bind:value={fLead} />
						</Field.Field>
					</div>
				</div>
				<Field.Field>
					<Field.Label for="sc-desc">Work order details</Field.Label>
					<Textarea
						id="sc-desc"
						rows={3}
						placeholder="What the work order should say…"
						bind:value={fDesc}
					/>
				</Field.Field>
			</Field.Group>
			<Modal.Footer>
				<Button type="button" variant="ghost" onclick={() => setOpen(false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !fTitle.trim() || !fProperty || !fNext}
					>{pending ? 'Saving…' : editing ? 'Save' : 'Create schedule'}</Button
				>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
