<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import AppSidebar from '#lib/components/app/app-sidebar.svelte';
	import CommandPalette from '#lib/components/app/command-palette.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
	let paletteOpen = $state(false);
</script>

<Sidebar.Provider>
	<AppSidebar user={data.user} org={data.org} onsearch={() => (paletteOpen = true)} />
	<Sidebar.Inset class="min-w-0">
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
