<script lang="ts">
	import PortalView from '#lib/components/app/portal-view.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { getPortal } from '#lib/remote/portal.remote.ts';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	const p = $derived(await getPortal());

	onMount(() => {
		if (page.url.searchParams.get('paid') === '1') {
			toast.success(
				'Thanks! Your payment was received. Bank payments can take a few days to clear.'
			);
			void goto('/portal', { state: page.state, shallow: true, replace: true });
		}
	});
</script>

<svelte:window onfocus={() => void getPortal().refresh()} />

<svelte:head><title>{p ? `${p.orgName} — Resident portal` : 'Resident portal'}</title></svelte:head>

{#if !p}
	<Card.Root>
		<Card.Header>
			<Card.Title>No home linked yet</Card.Title>
			<Card.Description
				>Ask your property manager for a portal invite link, then open it while signed in.</Card.Description
			>
		</Card.Header>
	</Card.Root>
{:else}
	<PortalView {p} />
{/if}
