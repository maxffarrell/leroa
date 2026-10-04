<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import TenantForm from '#lib/components/app/tenant-form.svelte';
	import { RowNav, openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { getTenants } from '#lib/remote/portfolio.remote.ts';
	import { initials, tenantName } from '#lib/format.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';

	const tenants = $derived(await getTenants());
	let filter = $state('');
	let creating = $state(page.url.searchParams.has('new'));
	const rows = $derived(
		filter
			? tenants.filter((t) =>
					`${tenantName(t)} ${t.email ?? ''} ${t.phone ?? ''} ${t.propertyName ?? ''}`
						.toLowerCase()
						.includes(filter.toLowerCase())
				)
			: tenants
	);
	const nav = new RowNav({
		count: () => rows.length,
		open: (i) => openHref(`/tenants/${rows[i]!.id}`),
		create: () => (creating = true)
	});
</script>

<svelte:window onkeydown={nav.onkeydown} />

<PageHeader title="Tenants">
	{#snippet actions()}
		<Button size="sm" onclick={() => (creating = true)}
			><Plus /> New <Kbd class="hidden sm:inline-flex">C</Kbd></Button
		>
	{/snippet}
</PageHeader>

<main class="p-4 md:p-6">
	{#if tenants.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Users /></Empty.Media>
				<Empty.Title>No tenants yet</Empty.Title>
				<Empty.Description>Add tenants here, or while creating a lease.</Empty.Description>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (creating = true)}><Plus /> Add tenant</Button></Empty.Content
			>
		</Empty.Root>
	{:else}
		<div class="mb-4 flex items-center gap-3">
			<Input
				placeholder="Filter by name, email, phone or property…"
				class="max-w-sm"
				bind:value={filter}
			/>
			<p class="ml-auto hidden text-xs text-muted-foreground md:block">
				{rows.length} of {tenants.length}
			</p>
		</div>
		<div class="overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Residence</Table.Head>
						<Table.Head class="hidden md:table-cell">Email</Table.Head>
						<Table.Head class="hidden lg:table-cell">Phone</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as t, i (t.id)}
						<Table.Row
							data-row={i}
							data-state={nav.index === i ? 'selected' : undefined}
							class="cursor-pointer"
							onclick={() => openHref(`/tenants/${t.id}`)}
							onmouseenter={() => (nav.index = i)}
						>
							<Table.Cell>
								<a
									href="/tenants/{t.id}"
									class="flex items-center gap-2.5 font-medium outline-none"
								>
									<Avatar.Root class="size-7"
										><Avatar.Fallback class="text-xs">{initials(tenantName(t))}</Avatar.Fallback
										></Avatar.Root
									>
									{tenantName(t)}
								</a>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground"
								>{t.propertyName
									? `${t.propertyName} · ${t.unitName}`
									: 'No active lease'}</Table.Cell
							>
							<Table.Cell class="hidden text-muted-foreground md:table-cell"
								>{t.email ?? ''}</Table.Cell
							>
							<Table.Cell class="hidden text-muted-foreground tabular-nums lg:table-cell"
								>{t.phone ?? ''}</Table.Cell
							>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>

<TenantForm bind:open={creating} oncreated={(t) => goto(`/tenants/${t.id}`)} />
