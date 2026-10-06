<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { getLeasingSettings, saveLeasingSettings } from '#lib/remote/crm.remote.ts';
	import { WEEKDAYS } from '#lib/tours.ts';
	import { toast } from 'svelte-sonner';

	const saved = $derived(await getLeasingSettings());
	const isAdmin = $derived(['owner', 'admin'].includes(page.data.role ?? ''));
	const zones =
		typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

	const toTime = (m: number) =>
		`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	const toMinutes = (t: string) => {
		const [h, m] = t.split(':').map(Number);
		return (h ?? 0) * 60 + (m ?? 0);
	};

	let draft = $state<{
		selfBooking: boolean;
		timezone: string;
		tourDays: number[];
		start: string;
		end: string;
		slotMinutes: string;
		noticeHours: number;
	} | null>(null);
	const form = $derived(
		draft ?? {
			selfBooking: saved.selfBooking,
			timezone:
				saved.configured || typeof Intl === 'undefined'
					? saved.timezone
					: Intl.DateTimeFormat().resolvedOptions().timeZone,
			tourDays: [...saved.tourDays],
			start: toTime(saved.tourStart),
			end: toTime(saved.tourEnd),
			slotMinutes: String(saved.slotMinutes),
			noticeHours: saved.noticeHours
		}
	);
	const edit = () => (draft ??= $state.snapshot(form));
	let pending = $state(false);

	function toggleDay(d: number) {
		edit();
		draft!.tourDays = draft!.tourDays.includes(d)
			? draft!.tourDays.filter((x) => x !== d)
			: [...draft!.tourDays, d];
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			await saveLeasingSettings({
				selfBooking: form.selfBooking,
				timezone: form.timezone,
				tourDays: form.tourDays,
				tourStart: toMinutes(form.start),
				tourEnd: toMinutes(form.end),
				slotMinutes: Number(form.slotMinutes) as 15 | 30 | 45 | 60,
				noticeHours: Math.max(0, Math.round(form.noticeHours || 0))
			});
			draft = null;
			toast.success('Leasing settings saved');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		} finally {
			pending = false;
		}
	}
</script>

<form onsubmit={save} class="max-w-2xl space-y-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>Tour booking</Card.Title>
			<Card.Description
				>Let prospects book their own tours from your public property and listing pages. Tours book
				into open times only, and you get an email for each one.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<Field.Group class="gap-5">
				<Field.Field orientation="horizontal">
					<Switch
						id="ls-self"
						checked={form.selfBooking}
						disabled={!isAdmin}
						onCheckedChange={(v) => (edit(), (draft!.selfBooking = v))}
					/>
					<Field.Label for="ls-self">Online tour booking</Field.Label>
				</Field.Field>
				<Field.Field>
					<Field.Label for="ls-tz">Time zone</Field.Label>
					<Input
						id="ls-tz"
						list="ls-zones"
						value={form.timezone}
						disabled={!isAdmin}
						oninput={(e) => (edit(), (draft!.timezone = e.currentTarget.value))}
					/>
					<datalist id="ls-zones">
						{#each zones as z (z)}<option value={z}></option>{/each}
					</datalist>
					<Field.Description
						>Tour times on public pages and in emails use this zone.</Field.Description
					>
				</Field.Field>
				<Field.Field>
					<Field.Label>Tour days</Field.Label>
					<div class="flex flex-wrap gap-1" role="group" aria-label="Tour days">
						{#each WEEKDAYS as label, d (label)}
							<Button
								type="button"
								size="sm"
								variant={form.tourDays.includes(d) ? 'secondary' : 'outline'}
								aria-pressed={form.tourDays.includes(d)}
								disabled={!isAdmin}
								onclick={() => toggleDay(d)}>{label}</Button
							>
						{/each}
					</div>
				</Field.Field>
				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Field>
						<Field.Label for="ls-start">From</Field.Label>
						<Input
							id="ls-start"
							type="time"
							step={900}
							value={form.start}
							disabled={!isAdmin}
							oninput={(e) => (edit(), (draft!.start = e.currentTarget.value))}
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label for="ls-end">Until</Field.Label>
						<Input
							id="ls-end"
							type="time"
							step={900}
							value={form.end}
							disabled={!isAdmin}
							oninput={(e) => (edit(), (draft!.end = e.currentTarget.value))}
						/>
					</Field.Field>
					<Field.Field>
						<Field.Label>Tour length</Field.Label>
						<Select.Root
							type="single"
							value={form.slotMinutes}
							disabled={!isAdmin}
							onValueChange={(v) => (edit(), (draft!.slotMinutes = v))}
						>
							<Select.Trigger class="w-full">{form.slotMinutes} minutes</Select.Trigger>
							<Select.Content>
								{#each ['15', '30', '45', '60'] as m (m)}
									<Select.Item value={m} label="{m} minutes" />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Field>
					<Field.Field>
						<Field.Label for="ls-notice">Minimum notice (hours)</Field.Label>
						<Input
							id="ls-notice"
							type="number"
							inputmode="numeric"
							min={0}
							max={168}
							value={form.noticeHours}
							disabled={!isAdmin}
							oninput={(e) => (edit(), (draft!.noticeHours = e.currentTarget.valueAsNumber))}
						/>
					</Field.Field>
				</div>
			</Field.Group>
		</Card.Content>
		{#if isAdmin}
			<Card.Footer class="justify-end gap-2">
				{#if draft}<Button type="button" variant="ghost" onclick={() => (draft = null)}
						>Cancel</Button
					>{/if}
				<Button type="submit" disabled={pending || (!draft && saved.configured)}>Save</Button>
			</Card.Footer>
		{/if}
	</Card.Root>
</form>
