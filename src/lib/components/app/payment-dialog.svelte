<script lang="ts">
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import MoneyInput from './money-input.svelte';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { recordPayment } from '#lib/remote/leasing.remote.ts';
	import { paymentMethods } from '#lib/schemas.ts';
	import { formatMoney, todayISO } from '#lib/format.ts';

	export type PaymentTarget = {
		leaseId: string;
		chargeId?: string | null;
		balance: number;
		label: string;
		month?: string;
	};
	let { target = $bindable(null) }: { target?: PaymentTarget | null } = $props();

	const methodLabels: Record<(typeof paymentMethods)[number], string> = {
		ach: 'ACH / bank',
		card: 'Card',
		check: 'Check',
		cash: 'Cash',
		transfer: 'Wire / transfer',
		other: 'Other'
	};
	let amount = $state<number | null>(null);
	let receivedOn = $state(todayISO());
	let method = $state<(typeof paymentMethods)[number]>('ach');
	let reference = $state('');
	let pending = $state(false);
	let key = $state(0);

	$effect(() => {
		if (target) {
			amount = target.balance > 0 ? target.balance : null;
			receivedOn = todayISO();
			reference = '';
			untrack(() => key++);
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!target || !amount) return;
		pending = true;
		try {
			await recordPayment({
				leaseId: target.leaseId,
				chargeId: target.chargeId ?? null,
				amount,
				receivedOn,
				method,
				reference: reference || null,
				month: target.month
			});
			toast.success(`${formatMoney(amount)} recorded`);
			target = null;
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not record payment'
			);
		} finally {
			pending = false;
		}
	}
</script>

<Modal.Root bind:open={() => !!target, (v) => !v && (target = null)}>
	<Modal.Content class="sm:max-w-sm">
		<form onsubmit={submit} class="space-y-5">
			<Modal.Header>
				<Modal.Title>Record payment</Modal.Title>
				<Modal.Description>{target?.label}</Modal.Description>
			</Modal.Header>
			<Field.Group class="gap-4">
				{#key key}
					<Field.Field
						><Field.Label for="pay-amt">Amount</Field.Label><MoneyInput
							id="pay-amt"
							required
							bind:value={amount}
						/></Field.Field
					>
				{/key}
				<div class="grid grid-cols-2 gap-3">
					<Field.Field
						><Field.Label for="pay-date">Received</Field.Label><Input
							id="pay-date"
							type="date"
							required
							bind:value={receivedOn}
						/></Field.Field
					>
					<Field.Field>
						<Field.Label>Method</Field.Label>
						<Select.Root type="single" bind:value={method}>
							<Select.Trigger class="w-full">{methodLabels[method]}</Select.Trigger>
							<Select.Content
								>{#each paymentMethods as m (m)}<Select.Item value={m}
										>{methodLabels[m]}</Select.Item
									>{/each}</Select.Content
							>
						</Select.Root>
					</Field.Field>
				</div>
				<Field.Field
					><Field.Label for="pay-ref">Reference</Field.Label><Input
						id="pay-ref"
						placeholder="Check # or transaction ID"
						bind:value={reference}
					/></Field.Field
				>
			</Field.Group>
			<Modal.Footer
				><Button type="submit" class="w-full" disabled={pending || !amount}
					>{pending ? 'Saving…' : 'Record payment'}</Button
				></Modal.Footer
			>
		</form>
	</Modal.Content>
</Modal.Root>
