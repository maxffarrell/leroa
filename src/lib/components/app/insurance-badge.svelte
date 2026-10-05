<script lang="ts">
	import { formatDate, todayISO } from '#lib/format.ts';
	import { insuranceState } from '#lib/vendors.ts';
	import { cn } from '#lib/utils.js';

	let { expiresOn, class: className = '' }: { expiresOn: string | null; class?: string } = $props();
	const state = $derived(insuranceState(expiresOn, todayISO()));
	const tone = {
		missing: 'text-muted-foreground',
		expired: 'bg-red-500/10 text-red-700 dark:text-red-400',
		expiring: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
		ok: 'text-muted-foreground'
	};
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full text-xs whitespace-nowrap',
		state === 'expired' || state === 'expiring' ? 'px-2 py-0.5 font-medium' : '',
		tone[state],
		className
	)}
	title={expiresOn ? `Insurance certificate expires ${formatDate(expiresOn)}` : undefined}
>
	{#if state === 'missing'}No certificate
	{:else if state === 'expired'}Expired {formatDate(expiresOn, true)}
	{:else if state === 'expiring'}Expires {formatDate(expiresOn, true)}
	{:else}Insured to {formatDate(expiresOn, true)}{/if}
</span>
