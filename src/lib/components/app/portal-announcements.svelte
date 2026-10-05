<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { getPortalAnnouncements } from '#lib/remote/messaging.remote.ts';
	import { formatDate } from '#lib/format.ts';
	import Megaphone from '@lucide/svelte/icons/megaphone';

	const items = $derived(await getPortalAnnouncements());
	let expanded = $state(false);
	const shown = $derived(expanded ? items : items.slice(0, 2));
</script>

{#if items.length}
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2"
				><Megaphone class="size-4" /> Announcements</Card.Title
			>
		</Card.Header>
		<Card.Content>
			<ul class="divide-y">
				{#each shown as a (a.id)}
					<li class="py-3 first:pt-0 last:pb-0">
						<div class="flex flex-wrap items-baseline gap-x-2">
							<h3 class="text-sm font-medium">{a.subject}</h3>
							<span class="text-xs text-muted-foreground"
								>{formatDate(a.createdAt)}{a.propertyName ? ` · ${a.propertyName}` : ''}</span
							>
						</div>
						<p class="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{a.body}</p>
					</li>
				{/each}
			</ul>
			{#if items.length > 2}
				<button
					class="mt-3 text-sm font-medium text-primary hover:underline"
					onclick={() => (expanded = !expanded)}
					>{expanded ? 'Show less' : `Show ${items.length - 2} older`}</button
				>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
