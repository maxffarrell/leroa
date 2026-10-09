<script lang="ts">
	import DemoBanner from '#lib/components/app/demo-banner.svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import AppSidebar from '#lib/components/app/app-sidebar.svelte';
	import CommandPalette from '#lib/components/app/command-palette.svelte';
	import { ConfirmDeleteDialog } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import TourGuide from '#lib/components/app/tour-guide.svelte';
	import Assistant from '#lib/components/app/assistant.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let paletteOpen = $state(false);
</script>

<Sidebar.Provider>
	<AppSidebar user={data.user} org={data.org} onsearch={() => (paletteOpen = true)} />
	<Sidebar.Inset class="min-w-0">
		{#if data.demo && data.demoExpiresAt}
			<DemoBanner
				expiresAt={data.demoExpiresAt}
				serverNow={data.demoServerNow}
				deployUrl="https://github.com/maxffarrell/leroa#quick-start"
			/>
		{/if}
		<svelte:boundary>
			{@render children()}
			{#snippet pending()}
				<div class="space-y-4 p-6">
					<Skeleton class="h-8 w-48" />
					<Skeleton class="h-32 w-full" />
					<Skeleton class="h-64 w-full" />
				</div>
			{/snippet}
			{#snippet failed(error, reset)}
				<div class="flex flex-col items-start gap-3 p-6">
					<h1 class="text-lg font-semibold">Something went wrong</h1>
					<p class="text-sm text-muted-foreground">
						{(error as Error)?.message ?? 'Unknown error'}
					</p>
					<button class="text-sm underline" onclick={reset}>Try again</button>
				</div>
			{/snippet}
		</svelte:boundary>
	</Sidebar.Inset>
</Sidebar.Provider>
<CommandPalette bind:open={paletteOpen} />
<ConfirmDeleteDialog />
<TourGuide userId={data.user.id} />
{#if data.enterprise}
	<Assistant />
{/if}
