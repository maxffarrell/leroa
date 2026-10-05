<script lang="ts">
	import { page } from '$app/state';
	import StatusBadge from './status-badge.svelte';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import {
		createAgreement,
		deleteAgreement,
		getAgreements,
		getTemplates,
		sendAgreement,
		updateAgreement,
		voidAgreement
	} from '#lib/remote/agreements.remote.ts';
	import { formatDate, formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import FileSignature from '@lucide/svelte/icons/file-signature';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';

	let { leaseId }: { leaseId: string } = $props();

	const agreements = $derived(await getAgreements(leaseId));
	const templates = $derived(await getTemplates());
	const isAdmin = $derived(page.data.role !== 'member');

	let editing = $state<{ id: string; title: string; body: string } | null>(null);
	let busy = $state(false);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	async function create(templateId?: string) {
		busy = true;
		try {
			const a = await createAgreement({ leaseId, templateId });
			editing = { id: a.id, title: a.title, body: a.body };
		} catch (err) {
			fail(err, 'Could not create the agreement');
		} finally {
			busy = false;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		busy = true;
		try {
			await updateAgreement(editing);
			editing = null;
			toast.success('Draft saved');
		} catch (err) {
			fail(err, 'Could not save');
		} finally {
			busy = false;
		}
	}

	async function send(id: string) {
		if (!confirm('Send for signature? The document can’t be edited after it’s sent.')) return;
		busy = true;
		try {
			const { unreachable } = await sendAgreement(id);
			editing = null;
			toast.success('Sent. Tenants can sign in their portal.');
			if (unreachable.length)
				toast.warning(
					`${unreachable.join(', ')} ${unreachable.length === 1 ? 'has' : 'have'} no email. Share a portal link so they can sign.`
				);
		} catch (err) {
			fail(err, 'Could not send');
		} finally {
			busy = false;
		}
	}

	async function remove(id: string) {
		if (!confirm('Delete this draft?')) return;
		await deleteAgreement(id).catch((err) => fail(err, 'Could not delete'));
	}

	async function voidIt(id: string) {
		if (!confirm('Void this agreement? Tenants will no longer be able to sign it.')) return;
		await voidAgreement(id).then(
			() => toast.success('Agreement voided'),
			(err) => fail(err, 'Could not void')
		);
	}

	const pdf = (id: string) => `/api/agreements/${id}/pdf`;
</script>

<section class="space-y-2">
	<div class="flex items-center gap-2">
		<h2 class="text-sm font-medium">Lease documents</h2>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger class="ml-auto">
				{#snippet child({ props })}<Button size="sm" variant="outline" disabled={busy} {...props}
						><Plus /> Agreement</Button
					>{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-60">
				<DropdownMenu.Label>Create from template</DropdownMenu.Label>
				{#each templates as t (t.id)}
					<DropdownMenu.Item onclick={() => create(t.id)}>{t.name}</DropdownMenu.Item>
				{:else}
					<DropdownMenu.Item onclick={() => create()}>Starter residential lease</DropdownMenu.Item>
				{/each}
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => (location.href = '/settings/templates')}
					>Manage templates…</DropdownMenu.Item
				>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>

	{#if agreements.length}
		<ul class="divide-y rounded-lg border text-sm">
			{#each agreements as a (a.id)}
				{@const signed = a.signers.filter((s) => s.signedAt).length}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
					<FileSignature class="size-4 shrink-0 text-muted-foreground" />
					<div class="min-w-0 flex-1">
						<a
							href={pdf(a.id)}
							target="_blank"
							rel="noopener"
							class="block truncate font-medium hover:underline">{a.title}</a
						>
						<p class="truncate text-xs text-muted-foreground">
							{#if a.status === 'draft'}Created {formatRelative(a.createdAt)}
							{:else if a.status === 'sent'}{signed} of {a.signers.length} signed · waiting on {a.signers
									.filter((s) => !s.signedAt)
									.map((s) => s.name)
									.join(', ')}
							{:else if a.status === 'signed'}Signed by everyone {formatDate(a.completedAt)}
							{:else}Voided{/if}
						</p>
					</div>
					<StatusBadge status={a.status} />
					{#if a.status === 'draft'}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => (editing = { id: a.id, title: a.title, body: a.body })}>Edit</Button
						>
						<Button size="sm" disabled={busy} onclick={() => send(a.id)}><Send /> Send</Button>
					{:else if a.status === 'signed'}
						<Button size="sm" variant="outline" href="{pdf(a.id)}?download">Download</Button>
					{/if}
					{#if a.status === 'draft' || (a.status === 'sent' && isAdmin)}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}<Button
										size="icon-sm"
										variant="ghost"
										aria-label="More"
										{...props}><Ellipsis /></Button
									>{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item onclick={() => window.open(pdf(a.id), '_blank')}
									>Preview PDF</DropdownMenu.Item
								>
								{#if a.status === 'draft'}
									<DropdownMenu.Item variant="destructive" onclick={() => remove(a.id)}
										>Delete draft</DropdownMenu.Item
									>
								{:else}
									<DropdownMenu.Item variant="destructive" onclick={() => voidIt(a.id)}
										>Void</DropdownMenu.Item
									>
								{/if}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
			No lease documents yet. Create one from a template and send it to tenants to sign online.
		</p>
	{/if}
</section>

<Dialog.Root open={!!editing} onOpenChange={(o) => !o && (editing = null)}>
	<Dialog.Content class="sm:max-w-3xl">
		{#if editing}
			<form onsubmit={save} class="flex max-h-[80vh] flex-col gap-4">
				<Dialog.Header>
					<Dialog.Title>Review agreement</Dialog.Title>
					<Dialog.Description
						>Lease details are filled in. Make any changes for this lease, then send it for
						signature.</Dialog.Description
					>
				</Dialog.Header>
				<Field.Field>
					<Field.Label for="ag-title">Title</Field.Label>
					<Input id="ag-title" required maxlength={200} bind:value={editing.title} />
				</Field.Field>
				<Field.Field class="min-h-0 flex-1">
					<Field.Label for="ag-body">Document</Field.Label>
					<Textarea
						id="ag-body"
						required
						class="min-h-64 flex-1 font-mono text-xs leading-relaxed"
						bind:value={editing.body}
					/>
				</Field.Field>
				<Dialog.Footer class="gap-2">
					<Button type="button" variant="ghost" onclick={() => (editing = null)}>Cancel</Button>
					<Button type="submit" variant="outline" disabled={busy}>Save draft</Button>
					<Button
						type="button"
						disabled={busy}
						onclick={async () => {
							if (!editing) return;
							const id = editing.id;
							try {
								await updateAgreement(editing);
							} catch (err) {
								return fail(err, 'Could not save');
							}
							await send(id);
						}}><Send /> Send for signature</Button
					>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
