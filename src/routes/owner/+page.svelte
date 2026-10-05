<script lang="ts">
	import OwnerReport from '#lib/components/app/owner-report.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { getOwnerPortal } from '#lib/remote/owners.remote.ts';

	const accounts = $derived(await getOwnerPortal());
</script>

<svelte:window onfocus={() => void getOwnerPortal().refresh()} />

<svelte:head><title>Owner portal</title></svelte:head>

{#each accounts as a (a.id)}
	<section class="space-y-4">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{a.name}</h1>
			<p class="text-sm text-muted-foreground">Managed by {a.orgName}</p>
		</div>
		<OwnerReport report={a.report} />
	</section>
{:else}
	<Card.Root>
		<Card.Header>
			<Card.Title>No properties linked yet</Card.Title>
			<Card.Description
				>Ask your property manager for an owner portal invite link, then open it while signed in.</Card.Description
			>
		</Card.Header>
	</Card.Root>
{/each}
