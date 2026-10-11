<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { cn } from '#lib/utils.js';
	import Flame from '@lucide/svelte/icons/flame';
	import Thermometer from '@lucide/svelte/icons/thermometer';
	import Snowflake from '@lucide/svelte/icons/snowflake';

	let {
		score,
		reason = null,
		class: className
	}: { score: string; reason?: string | null; class?: string } = $props();

	const meta = $derived(
		score === 'hot'
			? {
					icon: Flame,
					label: 'Hot',
					class: 'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400'
				}
			: score === 'warm'
				? {
						icon: Thermometer,
						label: 'Warm',
						class: 'border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400'
					}
				: {
						icon: Snowflake,
						label: 'Cold',
						class: 'text-muted-foreground'
					}
	);
</script>

{#if score}
	<Badge
		variant={score === 'cold' ? 'outline' : 'secondary'}
		class={cn('gap-1', meta.class, className)}
		title={reason ?? undefined}
	>
		<meta.icon class="size-3" />{meta.label}
	</Badge>
{/if}
