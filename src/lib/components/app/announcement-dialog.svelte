<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { toast } from 'svelte-sonner';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import { getAudience, sendAnnouncement } from '#lib/remote/messaging.remote.ts';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const ALL = 'all';
	let propertyId = $state(ALL);
	let subject = $state('');
	let body = $state('');
	let email = $state(true);
	let pending = $state(false);

	const properties = $derived(open ? await getProperties() : []);
	const audience = $derived(
		open ? await getAudience(propertyId === ALL ? null : propertyId) : null
	);
	const label = $derived(
		propertyId === ALL
			? 'All properties'
			: (properties.find((p) => p.id === propertyId)?.name ?? 'Select a property')
	);
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			const a = await sendAnnouncement({
				propertyId: propertyId === ALL ? null : propertyId,
				subject,
				body,
				email
			});
			toast.success(
				a.emailed
					? `Posted for ${plural(a.recipientCount, 'resident')}, ${a.emailedCount} emailed`
					: `Posted for ${plural(a.recipientCount, 'resident')}`
			);
			subject = '';
			body = '';
			open = false;
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not send');
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header>
				<Dialog.Title>New announcement</Dialog.Title>
				<Dialog.Description
					>Shown in the resident portal for residents on an active lease. Use it for building
					notices like water shut-offs, pest control or events.</Dialog.Description
				>
			</Dialog.Header>
			<Field.Field>
				<Field.Label>Send to</Field.Label>
				<Select.Root type="single" bind:value={propertyId}>
					<Select.Trigger class="w-full">{label}</Select.Trigger>
					<Select.Content class="max-h-72">
						<Select.Item value={ALL} label="All properties">All properties</Select.Item>
						{#each properties as p (p.id)}
							<Select.Item value={p.id} label={p.name}>{p.name}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				{#if audience}
					<Field.Description>
						{#if audience.residents === 0}
							No residents with an active lease here yet.
						{:else}
							{plural(audience.residents, 'resident')}, {audience.withEmail} with an email address.
						{/if}
					</Field.Description>
				{/if}
			</Field.Field>
			<Field.Field>
				<Field.Label for="ann-subject">Subject</Field.Label>
				<Input
					id="ann-subject"
					bind:value={subject}
					maxlength={200}
					required
					placeholder="Water shut-off on Tuesday"
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label for="ann-body">Message</Field.Label>
				<Textarea id="ann-body" bind:value={body} rows={6} maxlength={10000} required />
			</Field.Field>
			<Field.Field orientation="horizontal">
				<Switch id="ann-email" bind:checked={email} />
				<Field.Label for="ann-email" class="font-normal">Also email residents</Field.Label>
			</Field.Field>
			<Dialog.Footer>
				<Button
					type="submit"
					disabled={pending || !subject.trim() || !body.trim() || audience?.residents === 0}
					>{pending ? 'Sending…' : 'Send announcement'}</Button
				>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
