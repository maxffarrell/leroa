<script lang="ts">
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import StatusBadge from './status-badge.svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { getProperties, getUnits } from '#lib/remote/portfolio.remote.ts';
	import { aiTriageTicket } from '#lib/remote/ai.remote.ts';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';
	import type { Triage } from '#lib/ai/heuristics.ts';
	import { createTicket } from '#lib/remote/maintenance.remote.ts';
	import { getAssets } from '#lib/remote/operations.remote.ts';
	import { ticketPriorities } from '#lib/schemas.ts';

	type Props = {
		open?: boolean;
		propertyId?: string | null;
		unitId?: string | null;
		assetId?: string | null;
	};
	let {
		open = $bindable(false),
		propertyId = null,
		unitId = null,
		assetId = null
	}: Props = $props();

	const properties = $derived(open ? await getProperties() : []);
	const units = $derived(open ? await getUnits() : []);
	const assets = $derived(open ? await getAssets() : []);

	let property = $state('');
	let unit = $state('');
	let asset = $state('');
	let title = $state('');
	let description = $state('');
	let priority = $state<(typeof ticketPriorities)[number]>('normal');
	let pending = $state(false);
	let suggestion = $state<Triage | null>(null);
	let suggesting = $state(false);

	async function suggest() {
		if (!title.trim() || suggesting) return;
		suggesting = true;
		try {
			suggestion = await aiTriageTicket({
				title,
				description: description || null,
				propertyName: propertyName ?? null,
				unitName: unitName ?? null
			});
			priority = suggestion.priority;
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not triage');
		} finally {
			suggesting = false;
		}
	}

	$effect(() => {
		if (open) {
			property = propertyId ?? '';
			unit = unitId ?? '';
			asset = assetId ?? '';
		}
	});

	const propertyUnits = $derived(units.filter((u) => u.propertyId === property));
	const propertyName = $derived(properties.find((p) => p.id === property)?.name);
	const unitName = $derived(units.find((u) => u.id === unit)?.name);
	const propertyAssets = $derived(
		assets.filter(
			(a) => !a.archivedAt && a.propertyId === property && (!unit || !a.unitId || a.unitId === unit)
		)
	);
	const assetName = $derived(assets.find((a) => a.id === asset)?.name);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!property) return toast.error('Pick a property');
		pending = true;
		try {
			const t = await createTicket({
				propertyId: property,
				unitId: unit || null,
				assetId: asset || null,
				title,
				description: description || null,
				priority
			});
			toast.success(`Request #${t.number} created`);
			open = false;
			title = '';
			description = '';
			priority = 'normal';
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not create request'
			);
		} finally {
			pending = false;
		}
	}
</script>

<Modal.Root bind:open>
	<Modal.Content class="sm:max-w-lg">
		<form onsubmit={submit} class="space-y-5">
			<Modal.Header><Modal.Title>New maintenance request</Modal.Title></Modal.Header>
			<Field.Group class="gap-4">
				<Field.Field
					><Field.Label for="tk-title">What needs fixing?</Field.Label><Input
						id="tk-title"
						placeholder="Kitchen sink leaking"
						required
						bind:value={title}
						autofocus
					/></Field.Field
				>
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label>Property</Field.Label>
						<Select.Root type="single" bind:value={property} onValueChange={() => (unit = '')}>
							<Select.Trigger class="w-full">{propertyName ?? 'Select'}</Select.Trigger>
							<Select.Content class="max-h-72"
								>{#each properties as p (p.id)}<Select.Item value={p.id}>{p.name}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label>Unit</Field.Label>
						<Select.Root type="single" bind:value={unit} disabled={!property}>
							<Select.Trigger class="w-full">{unitName ?? 'Common area'}</Select.Trigger>
							<Select.Content class="max-h-72">
								<Select.Item value="">Common area</Select.Item>
								{#each propertyUnits as u (u.id)}<Select.Item value={u.id}>{u.name}</Select.Item
									>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				</div>
				{#if propertyAssets.length}
					<Field.Field>
						<Field.Label>Asset</Field.Label>
						<Select.Root type="single" bind:value={asset}>
							<Select.Trigger class="w-full">{assetName ?? 'None'}</Select.Trigger>
							<Select.Content class="max-h-72">
								<Select.Item value="">None</Select.Item>
								{#each propertyAssets as a (a.id)}<Select.Item value={a.id}>{a.name}</Select.Item
									>{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
				{/if}
				<Field.Field>
					<div class="flex items-center justify-between">
						<Field.Label>Priority</Field.Label>
						{#if page.data.ai}
							<Button
								type="button"
								size="xs"
								variant="ghost"
								disabled={suggesting || !title.trim()}
								onclick={suggest}><Sparkles /> {suggesting ? 'Suggesting…' : 'Suggest'}</Button
							>
						{/if}
					</div>
					<div class="flex gap-1.5">
						{#each ticketPriorities as p (p)}
							<button
								type="button"
								class="rounded-full ring-offset-2 ring-offset-background {priority === p
									? 'ring-2 ring-ring'
									: 'opacity-60 hover:opacity-100'}"
								onclick={() => (priority = p)}
							>
								<StatusBadge status={p} />
							</button>
						{/each}
					</div>
					{#if suggestion}
						<p class="flex items-start gap-2 text-xs text-muted-foreground">
							<Sparkles class="mt-px size-3.5 shrink-0" />
							<span class="min-w-0 flex-1"
								>Suggested <strong class="font-medium">{suggestion.priority}</strong
								>{suggestion.trade ? ` · ${suggestion.trade}` : ''} — {suggestion.reason}</span
							>
							<button
								type="button"
								aria-label="Dismiss suggestion"
								class="text-muted-foreground hover:text-foreground"
								onclick={() => (suggestion = null)}><X class="size-3.5" /></button
							>
						</p>
					{/if}
				</Field.Field>
				<Field.Field
					><Field.Label for="tk-desc">Details</Field.Label><Textarea
						id="tk-desc"
						rows={3}
						placeholder="Access instructions, photos to follow, etc."
						bind:value={description}
					/></Field.Field
				>
			</Field.Group>
			<Modal.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !title.trim()}
					>{pending ? 'Creating…' : 'Create request'}</Button
				>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
