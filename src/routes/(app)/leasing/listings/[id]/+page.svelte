<script lang="ts">
	import { page } from '$app/state';
	import ListingEditor from '#lib/components/app/listing-editor.svelte';
	import { getListing } from '#lib/remote/listings.remote.ts';

	const l = $derived(await getListing(page.params.id!));
</script>

{#key l.id}
	<ListingEditor listing={l} />
{/key}
