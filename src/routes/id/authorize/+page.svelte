<script lang="ts">
	import type { PageProps } from './$types';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { PROFILE_SCOPE_LABELS, petsText, type ProfileScope } from '#lib/profile.ts';
	import { formatMoney } from '#lib/format.ts';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	let { data }: PageProps = $props();
	const p = $derived(data.profile);

	function preview(s: ProfileScope) {
		if (s === 'contact')
			return [
				`${p.contact.firstName} ${p.contact.lastName}`.trim(),
				p.contact.email,
				p.contact.phone
			]
				.filter(Boolean)
				.join(' · ');
		if (s === 'household')
			return p.household.members.length
				? p.household.members.map((m) => m.name || m.relationship).join(', ')
				: 'Just you';
		if (s === 'pets') return petsText(p.pets) || 'No pets';
		return [
			p.application.currentAddress,
			p.application.employer,
			p.application.monthlyIncome != null
				? `${formatMoney(p.application.monthlyIncome, 'USD')}/mo`
				: ''
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<svelte:head><title>Share your Leroa profile</title></svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-xl">Share your profile with {data.client}?</Card.Title>
		<Card.Description>
			Choose what {data.client} can see. You can revoke access any time from
			<a href="/id" target="_blank" class="underline underline-offset-4">your Leroa profile</a>.
		</Card.Description>
	</Card.Header>
	<form method="POST">
		<Card.Content class="space-y-4">
			{#if data.empty}
				<Alert.Root>
					<Alert.Title>Your profile is empty</Alert.Title>
					<Alert.Description>
						<a href="/id" target="_blank" class="underline underline-offset-4">Fill it in</a>, then
						come back and reload this page.
					</Alert.Description>
				</Alert.Root>
			{/if}
			<div class="divide-y rounded-lg border">
				{#each data.scopes as s (s)}
					<div class="flex items-start gap-3 p-3">
						<Checkbox
							id="scope-{s}"
							name="scope"
							value={s}
							checked={data.granted ? data.granted.includes(s) : true}
							class="mt-0.5"
						/>
						<div class="min-w-0 space-y-0.5">
							<Label for="scope-{s}">{PROFILE_SCOPE_LABELS[s].label}</Label>
							<p class="text-sm text-muted-foreground">{PROFILE_SCOPE_LABELS[s].description}</p>
							{#if preview(s)}<p class="truncate text-sm">{preview(s)}</p>{/if}
						</div>
					</div>
				{/each}
			</div>
			<p class="flex gap-2 text-xs text-muted-foreground">
				<ShieldCheck class="size-4 shrink-0" />
				Only share with sites you trust. Your profile never includes your SSN, date of birth or credit
				reports.
			</p>
		</Card.Content>
		<Card.Footer class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<Button type="submit" name="decision" value="deny" variant="ghost">Cancel</Button>
			<Button type="submit" name="decision" value="allow">Share</Button>
		</Card.Footer>
	</form>
</Card.Root>
