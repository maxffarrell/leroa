<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import MoneyInput from '#lib/components/app/money-input.svelte';
	import {
		getMyProfile,
		getProfileGrants,
		revokeProfileGrant,
		saveMyProfile
	} from '#lib/remote/profile.remote.ts';
	import {
		PROFILE_SCOPE_LABELS,
		PROFILE_SCOPES,
		parseProfileFile,
		profileFile,
		type ProfileData
	} from '#lib/profile.ts';
	import { formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';

	let form = $state<ProfileData>(structuredClone((await getMyProfile()).data));
	const grants = $derived(await getProfileGrants());
	let saving = $state(false);
	let fileInput = $state<HTMLInputElement>();

	async function save(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		try {
			await saveMyProfile($state.snapshot(form));
			toast.success('Profile saved. Sites you share with get the update within a day.');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		} finally {
			saving = false;
		}
	}

	function exportFile() {
		const blob = new Blob([JSON.stringify(profileFile($state.snapshot(form)), null, 2)], {
			type: 'application/json'
		});
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = 'leroa-profile.json';
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function importFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		(e.currentTarget as HTMLInputElement).value = '';
		if (!file) return;
		const parsed = parseProfileFile(
			await file
				.text()
				.then(JSON.parse)
				.catch(() => null)
		);
		if (!parsed) return toast.error("That isn't a Leroa profile file");
		form = parsed;
		toast.success('Imported. Review it, then save.');
	}

	const scopeLabels = (scopes: string[]) =>
		PROFILE_SCOPES.filter((s) => scopes.includes(s))
			.map((s) => PROFILE_SCOPE_LABELS[s].label)
			.join(', ');
</script>

<svelte:head><title>Your Leroa profile</title></svelte:head>

<div>
	<h1 class="text-2xl font-semibold tracking-tight">Your Leroa profile</h1>
	<p class="text-sm text-muted-foreground">
		Fill this in once and use it to apply for homes and keep landlords up to date. Nothing is shared
		until you say so.
	</p>
</div>

<form onsubmit={save} class="space-y-6">
	<Card.Root>
		<Card.Header><Card.Title>Contact details</Card.Title></Card.Header>
		<Card.Content>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field>
					<Field.Label for="p-first">First name</Field.Label>
					<Input id="p-first" autocomplete="given-name" bind:value={form.contact.firstName} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="p-last">Last name</Field.Label>
					<Input id="p-last" autocomplete="family-name" bind:value={form.contact.lastName} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="p-email">Email</Field.Label>
					<Input id="p-email" type="email" autocomplete="email" bind:value={form.contact.email} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="p-phone">Phone</Field.Label>
					<Input id="p-phone" type="tel" autocomplete="tel" bind:value={form.contact.phone} />
				</Field.Field>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Household</Card.Title>
			<Card.Description>Anyone who would live with you.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			{#each form.household.members as m, i (i)}
				<div class="flex items-end gap-2">
					<Field.Field class="min-w-0 flex-1">
						<Field.Label for="m-name-{i}">Name</Field.Label>
						<Input id="m-name-{i}" bind:value={m.name} />
					</Field.Field>
					<Field.Field class="w-32 shrink-0 sm:w-40">
						<Field.Label for="m-rel-{i}">Relationship</Field.Label>
						<Input id="m-rel-{i}" placeholder="Partner" bind:value={m.relationship} />
					</Field.Field>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Remove {m.name || 'person'}"
						onclick={() => form.household.members.splice(i, 1)}><X /></Button
					>
				</div>
			{/each}
			{#if form.household.members.length < 19}
				<Button
					variant="outline"
					size="sm"
					onclick={() => form.household.members.push({ name: '', relationship: '' })}
					><Plus /> Add person</Button
				>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>Pets</Card.Title></Card.Header>
		<Card.Content class="space-y-3">
			{#each form.pets as pet, i (i)}
				<div class="flex items-end gap-2">
					<div class="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
						<Field.Field>
							<Field.Label for="pet-kind-{i}">Type</Field.Label>
							<Input id="pet-kind-{i}" placeholder="Dog" bind:value={pet.kind} />
						</Field.Field>
						<Field.Field>
							<Field.Label for="pet-name-{i}">Name</Field.Label>
							<Input id="pet-name-{i}" bind:value={pet.name} />
						</Field.Field>
						<Field.Field>
							<Field.Label for="pet-breed-{i}">Breed</Field.Label>
							<Input id="pet-breed-{i}" bind:value={pet.breed} />
						</Field.Field>
						<Field.Field>
							<Field.Label for="pet-weight-{i}">Weight</Field.Label>
							<Input id="pet-weight-{i}" placeholder="20 lb" bind:value={pet.weight} />
						</Field.Field>
					</div>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Remove {pet.name || 'pet'}"
						onclick={() => form.pets.splice(i, 1)}><X /></Button
					>
				</div>
			{/each}
			{#if form.pets.length < 10}
				<Button
					variant="outline"
					size="sm"
					onclick={() => form.pets.push({ kind: '', name: '', breed: '', weight: '' })}
					><Plus /> Add pet</Button
				>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Rental application</Card.Title>
			<Card.Description>Used to fill in applications when you choose to share it.</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Field class="sm:col-span-2">
					<Field.Label for="p-addr">Current address</Field.Label>
					<Input
						id="p-addr"
						autocomplete="street-address"
						bind:value={form.application.currentAddress}
					/>
				</Field.Field>
				<Field.Field>
					<Field.Label for="p-employer">Employer</Field.Label>
					<Input id="p-employer" bind:value={form.application.employer} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="p-income">Monthly income</Field.Label>
					<MoneyInput id="p-income" bind:value={form.application.monthlyIncome} />
				</Field.Field>
			</div>
		</Card.Content>
	</Card.Root>

	<div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
		<Button variant="ghost" class="w-full sm:w-auto" onclick={exportFile}
			><Download /> Export</Button
		>
		<Button variant="ghost" class="w-full sm:w-auto" onclick={() => fileInput?.click()}
			><Upload /> Import</Button
		>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			class="hidden"
			onchange={importFile}
		/>
		<Button type="submit" class="w-full sm:ml-auto sm:w-auto" disabled={saving}
			>{saving ? 'Saving…' : 'Save profile'}</Button
		>
	</div>
</form>

<Card.Root>
	<Card.Header>
		<Card.Title>Shared with</Card.Title>
		<Card.Description
			>Sites that can read your profile. Revoking stops future updates.</Card.Description
		>
	</Card.Header>
	<Card.Content class="px-0">
		{#if grants.length}
			<ul class="divide-y">
				{#each grants as g (g.id)}
					<li class="flex items-center gap-3 px-6 py-3">
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{new URL(g.clientId).host}</p>
							<p class="text-xs text-muted-foreground">
								{scopeLabels(g.scopes)} · {g.lastUsedAt
									? `last read ${formatRelative(g.lastUsedAt)}`
									: `shared ${formatRelative(g.createdAt)}`}
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onclick={async () => {
								await revokeProfileGrant(g.id);
								toast.success(`${new URL(g.clientId).host} can no longer read your profile`);
							}}>Revoke</Button
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="px-6 text-sm text-muted-foreground">You haven't shared your profile yet.</p>
		{/if}
	</Card.Content>
</Card.Root>
