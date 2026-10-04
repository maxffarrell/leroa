<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import { createTenant } from '#lib/remote/portfolio.remote.ts';

	type Created = Awaited<ReturnType<typeof createTenant>>;
	let { open = $bindable(false), oncreated }: { open?: boolean; oncreated?: (t: Created) => void } =
		$props();

	const blank = () => ({
		kind: 'person' as 'person' | 'company',
		firstName: '',
		lastName: '',
		companyName: '',
		email: '',
		phone: ''
	});
	let form = $state(blank());
	let pending = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			const t = await createTenant(form);
			toast.success('Tenant added');
			open = false;
			form = blank();
			oncreated?.(t);
		} catch (err) {
			toast.error(
				(err as { body?: { message?: string } })?.body?.message ?? 'Could not add tenant'
			);
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submit} class="space-y-5">
			<Dialog.Header><Dialog.Title>New tenant</Dialog.Title></Dialog.Header>
			<Field.Group class="gap-4">
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					bind:value={() => form.kind, (v) => v && (form.kind = v as 'person' | 'company')}
				>
					<ToggleGroup.Item value="person">Person</ToggleGroup.Item>
					<ToggleGroup.Item value="company">Company</ToggleGroup.Item>
				</ToggleGroup.Root>
				{#if form.kind === 'company'}
					<Field.Field
						><Field.Label for="t-co">Company name</Field.Label><Input
							id="t-co"
							required
							bind:value={form.companyName}
							autofocus
						/></Field.Field
					>
				{/if}
				<div class="grid grid-cols-2 gap-3">
					<Field.Field
						><Field.Label for="t-first"
							>{form.kind === 'company' ? 'Contact first name' : 'First name'}</Field.Label
						><Input
							id="t-first"
							required={form.kind === 'person'}
							bind:value={form.firstName}
							autofocus={form.kind === 'person'}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="t-last">Last name</Field.Label><Input
							id="t-last"
							bind:value={form.lastName}
						/></Field.Field
					>
				</div>
				<Field.Field
					><Field.Label for="t-email">Email</Field.Label><Input
						id="t-email"
						type="email"
						bind:value={form.email}
					/></Field.Field
				>
				<Field.Field
					><Field.Label for="t-phone">Phone</Field.Label><Input
						id="t-phone"
						type="tel"
						bind:value={form.phone}
					/></Field.Field
				>
			</Field.Group>
			<Dialog.Footer>
				<Button type="button" variant="ghost" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add tenant'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
