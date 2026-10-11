<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import StatusBadge from '#lib/components/app/status-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { getTenant, updateTenant, deleteTenant } from '#lib/remote/portfolio.remote.ts';
	import { createPortalLink } from '#lib/remote/portal.remote.ts';
	import { aiTenantSummary } from '#lib/remote/ai.remote.ts';
	import AiSummary from '#lib/components/app/ai-summary.svelte';
	import Link from '@lucide/svelte/icons/link';
	import { formatDate, formatMoney, formatRelative, initials, tenantName } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import RecordFields from '#lib/components/app/record-fields.svelte';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import FileSignature from '@lucide/svelte/icons/file-signature';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';

	const id = $derived(page.params.id!);
	const t = $derived(await getTenant(id));
	const name = $derived(tenantName(t));

	type Editable = 'firstName' | 'lastName' | 'email' | 'phone' | 'notes';
	async function save(field: Editable, value: string) {
		if ((t[field] ?? '') === value) return;
		try {
			await updateTenant({ id, [field]: value });
			toast.success('Saved');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		}
	}

	async function copyPortalLink() {
		const { path } = await createPortalLink(id);
		await navigator.clipboard.writeText(location.origin + path);
		toast.success('Portal invite link copied. It works for 14 days.');
	}

	async function remove() {
		if (!confirm(`Delete ${name}?`)) return;
		try {
			await deleteTenant(id);
			await goto('/tenants');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not delete');
		}
	}
</script>

<PageHeader title={name} crumbs={[{ label: 'Tenants', href: '/tenants' }]}>
	{#snippet actions()}
		<Button size="sm" variant="outline" href="/messages/{id}"
			><MessagesSquare /> <span class="hidden lg:inline">Message</span></Button
		>
		<Button size="sm" variant="outline" href="/tenants/{id}/portal"
			><MonitorSmartphone /> <span class="hidden lg:inline">Portal preview</span></Button
		>
		<Button size="sm" variant="outline" onclick={copyPortalLink}
			><Link />
			<span class="hidden lg:inline">{t.portalUserId ? 'Portal linked' : 'Portal invite'}</span
			></Button
		>
		<Button size="sm" href="/leases?new=1&tenant={id}"
			><FileSignature /> <span class="hidden sm:inline">New lease</span></Button
		>
	{/snippet}
</PageHeader>

<main class="grid gap-6 p-4 md:p-6 lg:grid-cols-[22rem_1fr]">
	<div class="space-y-4">
		<div class="flex items-center gap-3">
			<Avatar.Root class="size-12"><Avatar.Fallback>{initials(name)}</Avatar.Fallback></Avatar.Root>
			<div class="min-w-0">
				<h1 class="truncate text-lg font-semibold">{name}</h1>
				<div class="flex gap-3 text-sm text-muted-foreground">
					{#if t.email}<a
							class="flex items-center gap-1 hover:text-foreground"
							href="mailto:{t.email}"><Mail class="size-3.5" /> Email</a
						>{/if}
					{#if t.phone}<a class="flex items-center gap-1 hover:text-foreground" href="tel:{t.phone}"
							><Phone class="size-3.5" /> Call</a
						>{/if}
				</div>
			</div>
		</div>
		<Card.Root>
			<Card.Content>
				<Field.Group class="gap-3">
					<div class="grid grid-cols-2 gap-3">
						<Field.Field
							><Field.Label for="first">First name</Field.Label><Input
								id="first"
								value={t.firstName}
								onchange={(e) => save('firstName', e.currentTarget.value)}
							/></Field.Field
						>
						<Field.Field
							><Field.Label for="last">Last name</Field.Label><Input
								id="last"
								value={t.lastName}
								onchange={(e) => save('lastName', e.currentTarget.value)}
							/></Field.Field
						>
					</div>
					<Field.Field
						><Field.Label for="email">Email</Field.Label><Input
							id="email"
							type="email"
							value={t.email ?? ''}
							onchange={(e) => save('email', e.currentTarget.value)}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="phone">Phone</Field.Label><Input
							id="phone"
							type="tel"
							value={t.phone ?? ''}
							onchange={(e) => save('phone', e.currentTarget.value)}
						/></Field.Field
					>
					<Field.Field
						><Field.Label for="notes">Notes</Field.Label><Textarea
							id="notes"
							rows={3}
							value={t.notes ?? ''}
							onchange={(e) => save('notes', e.currentTarget.value)}
						/></Field.Field
					>
				</Field.Group>
			</Card.Content>
		</Card.Root>
		<p class="text-xs text-muted-foreground">
			Changes save when you leave a field. Added {formatRelative(t.createdAt)}.
		</p>
		<svelte:boundary>
			<RecordFields entity="tenant" recordId={t.id} />
			{#snippet pending()}{/snippet}
		</svelte:boundary>
		{#if page.data.enterprise}
			<AiSummary
				load={() => aiTenantSummary(id)}
				description="An AI overview of this tenant’s lease, balance, payments and requests."
			/>
		{/if}
		{#if t.leases.length === 0}<Button
				variant="ghost"
				size="sm"
				class="text-destructive"
				onclick={remove}>Delete tenant</Button
			>{/if}
	</div>

	<div class="space-y-6">
		<section class="space-y-2">
			<h2 class="text-sm font-medium">Leases</h2>
			{#if t.leases.length === 0}
				<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
					No leases yet.
				</p>
			{:else}
				<ul class="divide-y rounded-lg border">
					{#each t.leases as l (l.id)}
						<li>
							<a href="/leases/{l.id}" class="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
								<StatusBadge status={l.status} />
								<span class="min-w-0 flex-1 truncate text-sm font-medium"
									>{l.propertyName} · {l.unitName}</span
								>
								<span class="text-sm tabular-nums">{formatMoney(l.rentAmount, l.currency)}/mo</span>
								<span class="hidden text-xs text-muted-foreground sm:block"
									>{formatDate(l.startDate, true)} – {l.endDate
										? formatDate(l.endDate, true)
										: 'open'}</span
								>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
		<section class="space-y-2">
			<h2 class="text-sm font-medium">Maintenance requests</h2>
			{#if t.tickets.length === 0}
				<p class="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
					No requests.
				</p>
			{:else}
				<ul class="divide-y rounded-lg border">
					{#each t.tickets as k (k.id)}
						<li>
							<a
								href="/maintenance?ticket={k.id}"
								class="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
							>
								<StatusBadge status={k.status} />
								<span class="min-w-0 flex-1 truncate text-sm">#{k.number} {k.title}</span>
								<span class="text-xs text-muted-foreground">{formatRelative(k.createdAt)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>
