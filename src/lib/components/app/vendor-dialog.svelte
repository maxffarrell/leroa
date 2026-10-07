<script lang="ts">
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { PhoneInput } from '#lib/components/ui/phone-input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import { createVendor, updateVendor } from '#lib/remote/vendors.remote.ts';
	import { vendorTrades } from '#lib/schemas.ts';
	import Check from '@lucide/svelte/icons/check';

	type Existing = {
		id: string;
		name: string;
		contactName: string | null;
		email: string | null;
		phone: string | null;
		trades: string[];
		notes: string | null;
		insuranceExpiresOn: string | null;
	};
	let {
		open = $bindable(false),
		vendor = null,
		initialName = '',
		onsaved
	}: {
		open?: boolean;
		vendor?: Existing | null;
		initialName?: string;
		onsaved?: (v: { id: string; name: string }) => void;
	} = $props();

	const blank = () => ({
		name: '',
		contactName: '',
		email: '',
		phone: '',
		trades: [] as string[],
		notes: '',
		insuranceExpiresOn: ''
	});
	let form = $state(blank());
	let pending = $state(false);

	$effect(() => {
		if (!open) return;
		form = vendor
			? {
					name: vendor.name,
					contactName: vendor.contactName ?? '',
					email: vendor.email ?? '',
					phone: vendor.phone ?? '',
					trades: [...vendor.trades],
					notes: vendor.notes ?? '',
					insuranceExpiresOn: vendor.insuranceExpiresOn ?? ''
				}
			: { ...blank(), name: initialName };
	});

	const toggle = (t: string) =>
		(form.trades = form.trades.includes(t)
			? form.trades.filter((x) => x !== t)
			: [...form.trades, t]);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		const payload = {
			name: form.name,
			contactName: form.contactName || null,
			email: form.email.trim() || null,
			phone: form.phone || null,
			trades: form.trades,
			notes: form.notes || null,
			insuranceExpiresOn: form.insuranceExpiresOn || null
		};
		try {
			let saved: { id: string; name: string };
			if (vendor) {
				await updateVendor({ id: vendor.id, ...payload });
				saved = { id: vendor.id, name: payload.name };
			} else {
				saved = await createVendor(payload);
			}
			toast.success(vendor ? 'Vendor saved' : `${saved.name} added`);
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
				<Modal.Title>{vendor ? 'Edit vendor' : 'New vendor'}</Modal.Title>
				<Modal.Description
					>Vendors get a private link for each job. They don't need an account.</Modal.Description
				>
			</Modal.Header>
			<Field.Group class="gap-4">
				<Field.Field>
					<Field.Label for="vd-name">Company or name</Field.Label>
					<Input
						id="vd-name"
						placeholder="Rapid Plumbing"
						required
						bind:value={form.name}
						autofocus
					/>
				</Field.Field>
				<div class="grid gap-3 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="vd-contact">Contact person</Field.Label>
						<Input id="vd-contact" autocomplete="off" bind:value={form.contactName} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="vd-phone">Phone</Field.Label>
						<PhoneInput id="vd-phone" bind:value={form.phone} />
					</Field.Field>
				</div>
				<Field.Field>
					<Field.Label for="vd-email">Email</Field.Label>
					<Input
						id="vd-email"
						type="email"
						placeholder="dispatch@example.com"
						bind:value={form.email}
					/>
					<Field.Description>Work orders are emailed here.</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label>Trades</Field.Label>
					<div class="flex flex-wrap gap-1.5">
						{#each vendorTrades as t (t)}
							{@const on = form.trades.includes(t)}
							<button
								type="button"
								aria-pressed={on}
								onclick={() => toggle(t)}
								class="inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {on
									? 'border-primary bg-primary text-primary-foreground'
									: 'hover:bg-muted'}"
								>{#if on}<Check class="size-3" />{/if}{t}</button
							>
						{/each}
					</div>
				</Field.Field>
				<Field.Field>
					<Field.Label for="vd-coi">Insurance certificate expires</Field.Label>
					<Input
						id="vd-coi"
						type="date"
						class="w-full sm:w-48"
						bind:value={form.insuranceExpiresOn}
					/>
					<Field.Description>Leroa flags vendors whose certificate has lapsed.</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label for="vd-notes">Notes</Field.Label>
					<Textarea
						id="vd-notes"
						rows={3}
						placeholder="Rates, hours, service area…"
						bind:value={form.notes}
					/>
				</Field.Field>
			</Field.Group>
			<Modal.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending || !form.name.trim()}
					>{pending ? 'Saving…' : vendor ? 'Save' : 'Add vendor'}</Button
				>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>
