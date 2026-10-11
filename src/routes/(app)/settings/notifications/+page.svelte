<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		getNotificationSettings,
		saveNotificationSettings,
		sendTestEmail
	} from '#lib/remote/notifications.remote.ts';
	import { toast } from 'svelte-sonner';
	import Send from '@lucide/svelte/icons/send';

	type Prefs = Awaited<ReturnType<typeof getNotificationSettings>>['prefs'];
	type Toggle = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];

	const settings = $derived(await getNotificationSettings());
	const canEdit = $derived(page.data.role !== 'member' && !page.data.demo);
	let override = $state<Partial<Prefs>>({});
	const prefs = $derived({ ...settings.prefs, ...override });
	let testing = $state(false);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	async function save(patch: Partial<Prefs>) {
		override = { ...override, ...patch };
		try {
			await saveNotificationSettings({ ...prefs });
		} catch (err) {
			override = {};
			fail(err, 'Could not save');
		}
	}

	async function test() {
		testing = true;
		try {
			const { to } = await sendTestEmail();
			toast.success(settings.provider ? `Test email sent to ${to}` : 'Written to the server log');
		} catch (err) {
			fail(err, 'Could not send the test email');
		} finally {
			testing = false;
		}
	}
</script>

{#snippet toggle(key: Toggle, label: string, hint: string)}
	<div class="flex items-start justify-between gap-4 py-3">
		<div class="space-y-0.5">
			<Label for="n-{key}">{label}</Label>
			<p class="text-sm text-muted-foreground">{hint}</p>
		</div>
		<Switch
			id="n-{key}"
			checked={prefs[key]}
			disabled={!canEdit}
			onCheckedChange={(v) => save({ [key]: v })}
		/>
	</div>
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title>Email delivery</Card.Title>
		<Card.Description>
			{#if settings.provider}
				Sending through {settings.provider === 'resend' ? 'Resend' : 'SMTP'}.
			{:else}
				No email provider is set up, so emails are only written to the server log. Set <code
					class="font-mono text-xs">RESEND_API_KEY</code
				>
				or <code class="font-mono text-xs">SMTP_URL</code> to send them.
			{/if}
			{#if !settings.cron}
				Reminders go out when someone opens Leroa. Set <code class="font-mono text-xs"
					>CRON_SECRET</code
				>
				and call <code class="font-mono text-xs">/api/cron</code> daily to send them on time.
			{/if}
		</Card.Description>
		{#if canEdit}
			<Card.Action>
				<Button size="sm" variant="outline" disabled={testing} onclick={test}
					><Send /> Send test</Button
				>
			</Card.Action>
		{/if}
	</Card.Header>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Tenants</Card.Title>
		<Card.Description>Sent to every tenant on the lease who has an email address.</Card.Description>
	</Card.Header>
	<Card.Content class="divide-y">
		<div>
			{@render toggle(
				'rentReminders',
				'Rent reminders',
				'A reminder before rent is due, if it hasn’t been paid yet.'
			)}
			{#if prefs.rentReminders}
				<div class="flex items-center gap-2 pb-3 text-sm text-muted-foreground">
					<Input
						id="n-days"
						type="number"
						min={1}
						max={14}
						class="h-8 w-16"
						value={prefs.reminderDaysBefore}
						disabled={!canEdit}
						aria-label="Days before the due date"
						onchange={(e) => {
							const raw = Number.parseFloat(e.currentTarget.value);
							const n = Number.isFinite(raw)
								? Math.min(14, Math.max(1, Math.round(raw)))
								: prefs.reminderDaysBefore;
							e.currentTarget.value = String(n);
							void save({ reminderDaysBefore: n });
						}}
					/>
					days before the due date
				</div>
			{/if}
		</div>
		{@render toggle(
			'overdueNotices',
			'Overdue notices',
			'One notice the day after unpaid rent was due.'
		)}
		{@render toggle(
			'maintenanceUpdates',
			'Maintenance updates',
			'Tenants hear when their request is being worked on or done. Admins hear about new portal requests.'
		)}
	</Card.Content>
</Card.Root>

<Card.Root>
	<Card.Header>
		<Card.Title>Your team</Card.Title>
		<Card.Description>Sent to workspace owners and admins.</Card.Description>
	</Card.Header>
	<Card.Content class="divide-y">
		{@render toggle(
			'leaseExpiryAlerts',
			'Leases ending soon',
			'An alert 60 days before a lease ends without a renewal.'
		)}
		{@render toggle(
			'newApplications',
			'New applications',
			'An alert when someone applies through a public listing.'
		)}
		{@render toggle(
			'newLeads',
			'New leads and tour bookings',
			'An alert when someone contacts you, joins a waitlist or books a tour from a public page.'
		)}
		{@render toggle(
			'vendorInsuranceAlerts',
			'Vendor insurance expiring',
			'An alert when a vendor’s certificate of insurance is about to lapse, and again once it has.'
		)}
		{#if page.data.enterprise}
			{@render toggle(
				'aiDigest',
				'AI morning digest',
				'A daily email summarizing yesterday’s payments, new requests, and upcoming deadlines.'
			)}
		{/if}
	</Card.Content>
</Card.Root>
