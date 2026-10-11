<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { toast } from 'svelte-sonner';

	type Summary = { summary: string; flags: string[] } | null;

	let {
		load,
		description = 'Generated from the data shown on this page.'
	}: {
		load: () => Promise<Summary>;
		description?: string;
	} = $props();

	let result = $state<Summary>(null);
	let loading = $state(false);
	let ran = $state(false);

	async function run() {
		loading = true;
		try {
			result = await load();
			ran = true;
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not summarize');
		} finally {
			loading = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="flex items-center gap-1.5 text-sm"
			><Sparkles class="size-4 text-muted-foreground" /> AI summary</Card.Title
		>
		{#if ran}
			<Card.Action>
				<Button size="icon" variant="ghost" disabled={loading} onclick={run} aria-label="Refresh">
					<RefreshCw class={loading ? 'animate-spin' : ''} />
				</Button>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content>
		{#if !ran}
			<p class="text-sm text-muted-foreground">{description}</p>
			<Button size="sm" variant="outline" class="mt-3" disabled={loading} onclick={run}>
				<Sparkles />
				{loading ? 'Summarizing…' : 'Summarize'}
			</Button>
		{:else if result}
			<p class="text-sm leading-relaxed">{result.summary}</p>
			{#if result.flags.length}
				<div class="mt-3 flex flex-wrap gap-1.5">
					{#each result.flags as f (f)}<Badge variant="secondary">{f}</Badge>{/each}
				</div>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">Nothing to summarize yet.</p>
		{/if}
	</Card.Content>
</Card.Root>
