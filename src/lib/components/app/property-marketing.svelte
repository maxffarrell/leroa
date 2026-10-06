<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { getPropertyMarketing, updatePropertyMarketing } from '#lib/remote/crm.remote.ts';
	import { toast } from 'svelte-sonner';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import X from '@lucide/svelte/icons/x';

	let { propertyId }: { propertyId: string } = $props();
	const m = $derived(await getPropertyMarketing(propertyId));
	const url = $derived(`/l/${page.data.org?.slug}/p/${propertyId}`);
	const live = $derived(m.publicPage || m.publishedListings > 0);

	let description = $state<string | null>(null);
	let amenity = $state('');

	async function save(patch: {
		publicPage?: boolean;
		marketingDescription?: string;
		amenities?: string[];
	}) {
		try {
			await updatePropertyMarketing({ id: propertyId, ...patch });
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		}
	}

	async function saveDescription() {
		if (description === null || description === m.marketingDescription) return;
		await save({ marketingDescription: description });
		description = null;
		toast.success('Description saved');
	}

	function addAmenity(e: SubmitEvent) {
		e.preventDefault();
		const a = amenity.trim();
		if (!a || m.amenities.includes(a)) return;
		amenity = '';
		void save({ amenities: [...m.amenities, a] });
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Public page</Card.Title>
		<Card.Description
			>A marketing page for this property with its available homes, a contact form and tour booking.
			It's shown automatically while a listing here is published.</Card.Description
		>
		<Card.Action>
			<Button size="sm" variant="outline" href={url} target="_blank"
				><ExternalLink /> <span class="hidden sm:inline">{live ? 'View' : 'Preview'}</span></Button
			>
		</Card.Action>
	</Card.Header>
	<Card.Content>
		<Field.Group class="gap-4">
			<Field.Field orientation="horizontal">
				<Switch
					id="pm-public"
					checked={m.publicPage}
					onCheckedChange={(v) => save({ publicPage: v })}
				/>
				<Field.Label for="pm-public" class="font-normal"
					>Always show, even with nothing listed (for waitlist sign-ups)</Field.Label
				>
			</Field.Field>
			<Field.Field>
				<Field.Label for="pm-desc">About the property</Field.Label>
				<Textarea
					id="pm-desc"
					rows={4}
					placeholder="The building, the neighborhood, what residents love"
					value={description ?? m.marketingDescription}
					oninput={(e) => (description = e.currentTarget.value)}
					onblur={saveDescription}
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="pm-amenity">Building amenities</Field.Label>
				{#if m.amenities.length}
					<ul class="flex flex-wrap gap-1.5">
						{#each m.amenities as a (a)}
							<li
								class="inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-sm"
							>
								{a}
								<button
									type="button"
									class="rounded-full p-0.5 hover:bg-muted"
									aria-label="Remove {a}"
									onclick={() => save({ amenities: m.amenities.filter((x) => x !== a) })}
									><X class="size-3" /></button
								>
							</li>
						{/each}
					</ul>
				{/if}
				<form class="flex gap-2" onsubmit={addAmenity}>
					<Input id="pm-amenity" placeholder="e.g. Rooftop deck" bind:value={amenity} />
					<Button type="submit" variant="outline" disabled={!amenity.trim()}>Add</Button>
				</form>
			</Field.Field>
		</Field.Group>
	</Card.Content>
</Card.Root>
