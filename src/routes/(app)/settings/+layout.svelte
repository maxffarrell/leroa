<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import { cn } from '#lib/utils.js';
	import * as Alert from '#lib/components/ui/alert/index.js';

	let { children } = $props();
	const tabs = [
		{ href: '/settings', label: 'General' },
		{ href: '/settings/team', label: 'Team' },
		{ href: '/settings/notifications', label: 'Notifications' },
		{ href: '/settings/templates', label: 'Lease templates' },
		{ href: '/settings/leasing', label: 'Leasing' },
		{ href: '/settings/import', label: 'Import' },
		{ href: '/settings/audit', label: 'Audit log' },
		{ href: '/settings/fields', label: 'Fields' },
		{ href: '/settings/workflows', label: 'Workflows' },
		{ href: '/settings/payments', label: 'Payments' },
		{ href: '/settings/security', label: 'Security' },
		{ href: '/settings/integrations', label: 'Integrations' },
		{ href: '/settings/webhooks', label: 'Webhooks' },
		{ href: '/settings/api-keys', label: 'API keys' }
	];
	const current = $derived(tabs.find((t) => t.href === page.url.pathname) ?? tabs[0]!);
	const lockedInDemo = [
		'/settings/team',
		'/settings/integrations',
		'/settings/webhooks',
		'/settings/api-keys'
	];
</script>

<PageHeader title={current.label} crumbs={[{ label: 'Settings', href: '/settings' }]} />

<div class="flex flex-col gap-6 p-4 md:flex-row md:p-6">
	<nav class="flex shrink-0 gap-1 overflow-x-auto md:w-44 md:flex-col" aria-label="Settings">
		{#each tabs as t (t.href)}
			<a
				href={t.href}
				class={cn(
					'rounded-md px-3 py-1.5 text-sm whitespace-nowrap hover:bg-muted',
					current.href === t.href && 'bg-muted font-medium'
				)}
				aria-current={current.href === t.href ? 'page' : undefined}>{t.label}</a
			>
		{/each}
	</nav>
	<div class="max-w-3xl min-w-0 flex-1 space-y-6">
		{#if page.data.demo && lockedInDemo.includes(current.href)}
			<Alert.Root>
				<Alert.Title>Read-only in the public demo</Alert.Title>
				<Alert.Description
					>Invites, integrations, webhooks and API keys are turned off here. Deploy your own copy to
					try them.</Alert.Description
				>
			</Alert.Root>
		{/if}
		{@render children()}
	</div>
</div>
