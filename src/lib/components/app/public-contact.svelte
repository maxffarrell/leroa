<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { bookTour, getTourSlots, submitInquiry } from '#lib/remote/crm.remote.ts';
	import { formatTourTime } from '#lib/tours.ts';
	import { toast } from 'svelte-sonner';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	type Props = {
		org: { slug: string; name: string };
		propertyId: string;
		listingId?: string | null;
		selfBooking: boolean;
		preview?: boolean;
		/** No homes listed right now, so offer the waitlist. */
		waitlistDefault?: boolean;
	};
	let {
		org,
		propertyId,
		listingId = null,
		selfBooking,
		preview = false,
		waitlistDefault = false
	}: Props = $props();

	let tab = $state(untrack(() => (selfBooking ? 'tour' : 'message')));
	const slots = $derived(
		selfBooking && tab === 'tour' ? await getTourSlots({ orgSlug: org.slug, propertyId }) : null
	);
	let day = $state<string | null>(null);
	let slot = $state<string | null>(null);
	const activeDay = $derived(slots?.days.find((d) => d.date === day) ?? slots?.days[0] ?? null);

	const blank = () => ({
		firstName: '',
		lastName: '',
		email: '',
		phone: '',
		message: '',
		moveInDate: '',
		waitlist: false,
		consent: false,
		website: ''
	});
	let form = $state(blank());
	let pending = $state(false);
	let done = $state<string | null>(null);
	const wantWaitlist = $derived(form.waitlist || (waitlistDefault && tab === 'message'));

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	function contact() {
		return {
			orgSlug: org.slug,
			propertyId,
			listingId,
			firstName: form.firstName,
			lastName: form.lastName,
			email: form.email,
			phone: form.phone || null,
			consent: true as const,
			website: form.website
		};
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (preview) return toast.error('This page is a preview. Make it public first.');
		if (!form.consent) return toast.error(`Agree to be contacted by ${org.name}`);
		pending = true;
		try {
			if (tab === 'tour') {
				if (!slot) return toast.error('Pick a time');
				const r = await bookTour({
					...contact(),
					propertyId,
					startsAt: slot,
					message: form.message || null
				});
				done = `You're booked for ${r.when}.${r.emailed ? " We've emailed you a confirmation." : ''}`;
			} else {
				await submitInquiry({
					...contact(),
					message: form.message || null,
					moveInDate: form.moveInDate || null,
					waitlist: wantWaitlist
				});
				done = wantWaitlist
					? `You're on the waitlist. ${org.name} will email you when a home opens up.`
					: `Message sent. ${org.name} will get back to you soon.`;
			}
			form = blank();
			slot = null;
		} catch (err) {
			fail(err, 'Could not send');
			if (tab === 'tour') slot = null;
		} finally {
			pending = false;
		}
	}
</script>

{#if done}
	<div class="flex flex-col items-center gap-3 rounded-xl border p-8 text-center">
		<CircleCheck class="size-10 text-emerald-600" />
		<p class="max-w-sm text-sm">{done}</p>
		<Button variant="outline" onclick={() => (done = null)}>Done</Button>
	</div>
{:else}
	<form onsubmit={submit} class="space-y-4">
		{#if selfBooking}
			<Tabs.Root bind:value={tab}>
				<Tabs.List class="w-full">
					<Tabs.Trigger value="tour" class="flex-1">Book a tour</Tabs.Trigger>
					<Tabs.Trigger value="message" class="flex-1">Ask a question</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		{/if}

		{#if tab === 'tour' && slots}
			{#if slots.days.length === 0}
				<p class="text-sm text-muted-foreground">
					No tour times are open in the next two weeks. Send a message instead.
				</p>
			{:else}
				<div class="space-y-3">
					<div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Day">
						{#each slots.days as d (d.date)}
							{@const date = new Date(`${d.date}T12:00:00Z`)}
							<button
								type="button"
								class="flex w-14 shrink-0 flex-col items-center rounded-lg border py-2 text-sm transition-colors hover:bg-muted {activeDay?.date ===
								d.date
									? 'border-primary bg-primary/5 font-medium'
									: ''}"
								aria-pressed={activeDay?.date === d.date}
								onclick={() => ((day = d.date), (slot = null))}
							>
								<span class="text-xs text-muted-foreground"
									>{date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span
								>
								<span class="tabular-nums"
									>{date.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })}</span
								>
								<span class="text-[10px] text-muted-foreground"
									>{date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span
								>
							</button>
						{/each}
					</div>
					{#if activeDay}
						<div class="grid grid-cols-3 gap-2" role="group" aria-label="Time">
							{#each activeDay.slots as s (s)}
								<Button
									type="button"
									size="sm"
									variant={slot === s ? 'default' : 'outline'}
									aria-pressed={slot === s}
									class="tabular-nums"
									onclick={() => (slot = s)}>{formatTourTime(s, slots.timezone, false)}</Button
								>
							{/each}
						</div>
						<p class="text-xs text-muted-foreground">Times in {slots.timezone.replace('_', ' ')}</p>
					{/if}
				</div>
			{/if}
		{/if}

		<div class="grid gap-3 sm:grid-cols-2">
			<Field.Field>
				<Field.Label for="pc-first">First name</Field.Label>
				<Input id="pc-first" autocomplete="given-name" required bind:value={form.firstName} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="pc-last">Last name</Field.Label>
				<Input id="pc-last" autocomplete="family-name" required bind:value={form.lastName} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="pc-email">Email</Field.Label>
				<Input id="pc-email" type="email" autocomplete="email" required bind:value={form.email} />
			</Field.Field>
			<Field.Field>
				<Field.Label for="pc-phone">Phone</Field.Label>
				<Input id="pc-phone" type="tel" autocomplete="tel" bind:value={form.phone} />
			</Field.Field>
		</div>
		{#if tab === 'message'}
			<Field.Field>
				<Field.Label for="pc-move">Preferred move-in</Field.Label>
				<Input id="pc-move" type="date" bind:value={form.moveInDate} />
			</Field.Field>
		{/if}
		<Field.Field>
			<Field.Label for="pc-msg"
				>{tab === 'tour' ? 'Anything we should know?' : 'Message'}</Field.Label
			>
			<Textarea id="pc-msg" rows={3} bind:value={form.message} />
		</Field.Field>
		{#if tab === 'message' && !waitlistDefault}
			<Field.Field orientation="horizontal">
				<Checkbox id="pc-wait" bind:checked={form.waitlist} />
				<Field.Label for="pc-wait" class="text-sm font-normal"
					>Email me when a similar home is available</Field.Label
				>
			</Field.Field>
		{/if}
		<div class="sr-only" aria-hidden="true">
			<label for="pc-website">Website</label>
			<input id="pc-website" tabindex="-1" autocomplete="off" bind:value={form.website} />
		</div>
		<Field.Field orientation="horizontal">
			<Checkbox id="pc-consent" bind:checked={form.consent} />
			<Field.Label for="pc-consent" class="text-sm leading-snug font-normal"
				>{org.name} may contact me by email or phone about renting.</Field.Label
			>
		</Field.Field>
		<Button type="submit" class="w-full" disabled={pending || (tab === 'tour' && !slot)}>
			{pending
				? 'Sending…'
				: tab === 'tour'
					? slot
						? `Book ${formatTourTime(slot, slots?.timezone)}`
						: 'Pick a time'
					: wantWaitlist
						? 'Join the waitlist'
						: 'Send message'}
		</Button>
	</form>
{/if}
