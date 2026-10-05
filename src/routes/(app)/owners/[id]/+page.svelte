<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import OwnerDialog from '#lib/components/app/owner-dialog.svelte';
	import OwnerReport from '#lib/components/app/owner-report.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import {
		createOwnerLink,
		getOwner,
		getOwnerReport,
		updateOwner
	} from '#lib/remote/owners.remote.ts';
	import { formatDate } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Link from '@lucide/svelte/icons/link';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';

	const o = $derived(await getOwner(page.params.id!));
	const report = $derived(await getOwnerReport(page.params.id!));
	let editing = $state(false);

	const message = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	async function copyInvite() {
		try {
			const { path } = await createOwnerLink(o.id);
			await navigator.clipboard.writeText(location.origin + path);
			toast.success('Owner portal invite copied. It works for 14 days.');
		} catch (err) {
			toast.error(message(err, 'Could not create invite'));
		}
	}

	async function setArchived(archived: boolean) {
		try {
			await updateOwner({ id: o.id, archived });
			toast.success(archived ? `${o.name} archived` : `${o.name} restored`);
		} catch (err) {
			toast.error(message(err, 'Could not update'));
		}
	}
</script>

<PageHeader title={o.name} crumbs={[{ label: 'Owners', href: '/owners' }]}>
	{#snippet actions()}
		<Button size="sm" variant="outline" onclick={() => (editing = true)}
			><Pencil /> <span class="hidden sm:inline">Edit</span></Button
		>
		{#if !o.archivedAt}
			<Button size="sm" variant="outline" onclick={copyInvite}
				><Link />
				<span class="hidden sm:inline">{o.portalLinked ? 'Portal linked' : 'Portal invite'}</span
				></Button
			>
		{/if}
		{#if page.data.role !== 'member'}
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
					{#if o.archivedAt}
						<DropdownMenu.Item onclick={() => setArchived(false)}>Restore owner</DropdownMenu.Item>
					{:else}
						<DropdownMenu.Item variant="destructive" onclick={() => setArchived(true)}
							>Archive owner</DropdownMenu.Item
						>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/snippet}
</PageHeader>

<main class="grid gap-6 p-4 md:p-6 lg:grid-cols-[1fr_18rem]">
	<section class="min-w-0 space-y-4">
		<div>
			<h2 class="text-sm font-medium">Owner view</h2>
			<p class="text-sm text-muted-foreground">
				What {o.name} sees in the owner portal. It's read-only and never shows tenant contact details.
			</p>
		</div>
		<OwnerReport {report} />
	</section>

	<Card.Root class="h-fit lg:order-first lg:col-start-2 lg:row-start-1">
		<Card.Header>
			<Card.Title>Contact</Card.Title>
			<Card.Description
				>{o.archivedAt
					? 'Archived. Portal access is off.'
					: o.portalLinked
						? 'Signed in to the owner portal'
						: 'Not invited to the portal yet'}</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-3 text-sm">
			{#if o.email}
				<a href="mailto:{o.email}" class="flex items-center gap-2 hover:underline"
					><Mail class="size-4 text-muted-foreground" />{o.email}</a
				>
			{/if}
			{#if o.phone}
				<a href="tel:{o.phone}" class="flex items-center gap-2 tabular-nums hover:underline"
					><Phone class="size-4 text-muted-foreground" />{o.phone}</a
				>
			{/if}
			{#if !o.email && !o.phone}<p class="text-muted-foreground">No contact details.</p>{/if}
			<div>
				<p class="text-xs text-muted-foreground">Properties</p>
				<ul class="mt-1 space-y-1">
					{#each o.properties as p (p.id)}
						<li><a href="/properties/{p.id}" class="hover:underline">{p.name}</a></li>
					{:else}
						<li class="text-muted-foreground">None assigned</li>
					{/each}
				</ul>
			</div>
			{#if o.notes}
				<div>
					<p class="text-xs text-muted-foreground">Notes</p>
					<p class="mt-1 whitespace-pre-line">{o.notes}</p>
				</div>
			{/if}
			<p class="text-xs text-muted-foreground">Added {formatDate(o.createdAt)}</p>
		</Card.Content>
	</Card.Root>
</main>

<OwnerDialog bind:open={editing} owner={o} />
