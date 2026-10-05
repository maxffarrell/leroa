<script lang="ts">
	import PageHeader from '#lib/components/app/page-header.svelte';
	import { REPORT_KEYS, REPORTS } from '#lib/reports.ts';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Upload from '@lucide/svelte/icons/upload';
</script>

<PageHeader title="Reports" />

<main class="space-y-6 p-4 md:p-6">
	<ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each REPORT_KEYS as key (key)}
			<li>
				<a
					href="/reports/{key}"
					class="group flex h-full items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<div class="min-w-0 flex-1">
						<p class="font-medium">{REPORTS[key].title}</p>
						<p class="mt-1 text-sm text-muted-foreground">{REPORTS[key].description}</p>
					</div>
					<ChevronRight
						class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
					/>
				</a>
			</li>
		{/each}
	</ul>
	<p class="text-sm text-muted-foreground">
		Every report downloads as CSV. Moving from another system? <a
			href="/settings/import"
			class="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
			><Upload class="size-3.5" /> Import properties, tenants and leases</a
		>
	</p>
</main>
