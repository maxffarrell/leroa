<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import MoneyInput from './money-input.svelte';
	import { renewLease } from '#lib/remote/leasing.remote.ts';
	import { addDays, addYears, formatMoney, todayISO } from '#lib/format.ts';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	type Props = {
		open?: boolean;
		lease: {
			id: string;
			endDate: string | null;
			rentAmount: number;
			currency: string;
		};
	};
	let { open = $bindable(false), lease }: Props = $props();

	let startDate = $state(todayISO());
	let endDate = $state('');
	let rent = $state<number | null>(null);
	let pending = $state(false);

	$effect(() => {
		if (open)
			untrack(() => {
				startDate = lease.endDate ? addDays(lease.endDate, 1) : todayISO();
				endDate = addDays(addYears(startDate, 1), -1);
				rent = lease.rentAmount;
			});
	});

	const change = $derived(
		rent && lease.rentAmount ? ((rent - lease.rentAmount) / lease.rentAmount) * 100 : 0
	);
	const bump = (pct: number) =>
		(rent = Math.round((lease.rentAmount * (1 + pct / 100)) / 100) * 100);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!rent) return toast.error('Enter the rent');
		pending = true;
		try {
			const l = await renewLease({
				id: lease.id,
				startDate,
				endDate: endDate || null,
				rentAmount: rent
			});
			toast.success('Lease renewed');
			open = false;
			await goto(`/leases/${l.id}`);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not renew');
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>Renew lease</Dialog.Title>
				<Dialog.Description
					>Creates the next lease for the same unit and tenants. The deposit carries over and the
					current lease ends the day before.</Dialog.Description
				>
			</Dialog.Header>
			<Field.Group class="gap-4">
				<div class="grid grid-cols-2 gap-3">
					<Field.Field>
						<Field.Label for="rn-start">Starts</Field.Label>
						<Input id="rn-start" type="date" required bind:value={startDate} />
					</Field.Field>
					<Field.Field>
						<Field.Label for="rn-end">Ends</Field.Label>
						<Input id="rn-end" type="date" bind:value={endDate} />
						<Field.Description>Blank for month-to-month.</Field.Description>
					</Field.Field>
				</div>
				<Field.Field>
					<Field.Label for="rn-rent">Monthly rent</Field.Label>
					<MoneyInput id="rn-rent" required bind:value={rent} />
					<div class="flex flex-wrap items-center gap-1.5">
						{#each [0, 3, 5] as pct (pct)}
							<Button type="button" size="sm" variant="outline" onclick={() => bump(pct)}
								>{pct ? `+${pct}%` : 'Same'}</Button
							>
						{/each}
						<span class="ml-auto text-xs text-muted-foreground tabular-nums">
							Now {formatMoney(lease.rentAmount, lease.currency)}{change
								? ` · ${change > 0 ? '+' : ''}${change.toFixed(1)}%`
								: ''}
						</span>
					</div>
				</Field.Field>
			</Field.Group>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending}>{pending ? 'Renewing…' : 'Renew lease'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
