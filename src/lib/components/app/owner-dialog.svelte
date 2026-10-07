<script lang="ts">
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { PhoneInput } from '#lib/components/ui/phone-input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import { createOwner, updateOwner } from '#lib/remote/owners.remote.ts';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import Check from '@lucide/svelte/icons/check';

	type Existing = {
		id: string;
		name: string;
		email: string | null;
		phone: string | null;
		notes: string | null;
		properties: { id: string }[];
	};
	let {
		open = $bindable(false),
		owner = null,
		initialPropertyIds = [],
		onsaved
	}: {
		open?: boolean;
		owner?: Existing | null;
		initialPropertyIds?: string[];
		onsaved?: (o: { id: string; name: string }) => void;
	} = $props();

	const properties = $derived(open ? await getProperties() : []);
	const blank = () => ({ name: '', email: '', phone: '', notes: '', propertyIds: [] as string[] });
	let form = $state(blank());
	let pending = $state(false);

	$effect(() => {
		if (!open) return;
		form = owner
			? {
					name: owner.name,
					email: owner.email ?? '',
					phone: owner.phone ?? '',
					notes: owner.notes ?? '',
					propertyIds: owner.properties.map((p) => p.id)
				}
			: { ...blank(), propertyIds: [...initialPropertyIds] };
	});

	const toggle = (id: string) =>
		(form.propertyIds = form.propertyIds.includes(id)
			? form.propertyIds.filter((x) => x !== id)
			: [...form.propertyIds, id]);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		const payload = {
			name: form.name,
			email: form.email.trim() || null,
			phone: form.phone || null,
			notes: form.notes || null,
			propertyIds: form.propertyIds
		};
		try {
			let saved: { id: string; name: string };
			if (owner) {
				await updateOwner({ id: owner.id, ...payload });
				saved = { id: owner.id, name: payload.name };
			} else {
				saved = await createOwner(payload);
			}
			toast.success(owner ? 'Owner saved' : `${saved.name} added`);
			open = false;
			onsaved?.(saved);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		} finally {
			pending = false;
		}
	}
</script>

<Modal.Root bind:open>
	<Modal.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<form onsubmit={submit} class="space-y-5">
			<Modal.Header>
				<Modal.Title>{owner ? 'Edit owner' : 'New owner'}</Modal.Title>
				<Modal.Description
					>Owners get a read-only portal with occupancy, rent collection and maintenance for their
					properties.</Modal.Description
				>
			</Modal.Header>
			<Field.Group class="gap-4">
				<Field.Field>
					<Field.Label for="ow-name">Name or company</Field.Label>
					<Input
						id="ow-name"
						placeholder="Rivera Family Trust"
						required
						bind:value={form.name}
						autofocus
					/>
				</Field.Field>
				<div class="grid gap-3 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="ow-email">Email</Field.Label>
						<Input id="ow-email" type="email" bind:value={form.email} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="ow-phone">Phone</Field.Label>
						<PhoneInput id="ow-phone" bind:value={form.phone} />
					</Field.Field>
				</div>
				<Field.Field>
					<Field.Label>Properties</Field.Label>
					{#if properties.length}
						<div class="flex flex-wrap gap-1.5">
							{#each properties as p (p.id)}
								{@const on = form.propertyIds.includes(p.id)}
								<button
									type="button"
									aria-pressed={on}
									onclick={() => toggle(p.id)}
									class="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {on
										? 'border-primary bg-primary text-primary-foreground'
										: 'hover:bg-muted'}"
									>{#if on}<Check class="size-3" />{/if}{p.name}</button
								>
							{/each}
						</div>
					{:else}
						<Field.Description>Add a property first, then assign it here.</Field.Description>
					{/if}
				</Field.Field>
				<Field.Field>
					<Field.Label for="ow-notes">Notes</Field.Label>
					<Textarea
						id="ow-notes"
						rows={3}
						placeholder="Only your team sees these"
						bind:value={form.notes}
					/>
				</Field.Field>
			</Field.Group>
			<Modal.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !form.name.trim()}
					>{pending ? 'Saving…' : owner ? 'Save' : 'Add owner'}</Button
				>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
