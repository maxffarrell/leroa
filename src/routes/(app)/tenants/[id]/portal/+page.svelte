<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import PortalView from '#lib/components/app/portal-view.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { previewPortal } from '#lib/remote/portal.remote.ts';
	import { tenantName } from '#lib/format.ts';
	import Eye from '@lucide/svelte/icons/eye';

	const id = $derived(page.params.id!);
	const v = $derived(await previewPortal(id));
	const name = $derived(tenantName(v.tenant));
</script>

<svelte:head><title>Portal preview · {name}</title></svelte:head>

<PageHeader
	title="Portal preview"
	crumbs={[
		{ label: 'Tenants', href: '/tenants' },
		{ label: name, href: `/tenants/${id}` }
	]}
/>

<main class="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
	<div
		class="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm"
	>
		<Eye class="size-4 shrink-0 text-primary" />
		<p>
			This is what <span class="font-medium">{name}</span> sees in the resident portal — read-only. Payments,
			requests, signatures and replies are disabled.
		</p>
	</div>

	{#if !v.overview}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Title>No home linked yet</Empty.Title>
				<Empty.Description>
					This tenant has no active or draft lease, so their portal would show the "No home linked
					yet" state.
				</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button href={`/leases?new=1&tenant=${id}`}>New lease</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<PortalView p={v.overview} preview threads={v.threads} announcements={v.announcements} />
	{/if}
</main>
