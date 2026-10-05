<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import MoneyInput from './money-input.svelte';
	import { updateLease } from '#lib/remote/leasing.remote.ts';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Props = {
		open?: boolean;
		lease: { id: string; lateFeeAmount: number; lateFeeGraceDays: number };
	};
	let { open = $bindable(false), lease }: Props = $props();

	let amount = $state<number | null>(null);
	let grace = $state(5);
	let pending = $state(false);

	$effect(() => {
		if (open)
			untrack(() => {
				amount = lease.lateFeeAmount || null;
				grace = lease.lateFeeGraceDays;
			});
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			await updateLease({ id: lease.id, lateFeeAmount: amount ?? 0, lateFeeGraceDays: grace });
			toast.success(amount ? 'Late fee saved' : 'Late fee turned off');
			open = false;
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>Late fee</Dialog.Title>
				<Dialog.Description
					>Added automatically when rent is still unpaid after the grace period. Late fee limits
					vary by location.</Dialog.Description
				>
			</Dialog.Header>
			<div class="grid grid-cols-2 gap-3">
				<Field.Field>
					<Field.Label for="lf-amount">Flat fee</Field.Label>
					<MoneyInput id="lf-amount" bind:value={amount} />
					<Field.Description>Blank for none.</Field.Description>
				</Field.Field>
				<Field.Field>
					<Field.Label for="lf-grace">Grace days</Field.Label>
					<Input id="lf-grace" type="number" min={0} max={31} required bind:value={grace} />
				</Field.Field>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending}>Save</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
