<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client.ts';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { SOCIAL_ICONS, SOCIAL_LABELS, type SocialProvider } from './social-sign-in.svelte';
	import { toast } from 'svelte-sonner';
	import Check from '@lucide/svelte/icons/check';

	const providers = $derived((page.data.social ?? []) as SocialProvider[]);
	let accounts = $state<{ providerId: string }[] | null>(null);
	let pending = $state<string | null>(null);

	$effect(() => {
		void authClient.listAccounts().then((r) => (accounts = r.data ?? []));
	});

	const linked = $derived(new Set((accounts ?? []).map((a) => a.providerId)));

	async function link(provider: SocialProvider) {
		pending = provider;
		const { error } = await authClient.linkSocial({ provider, callbackURL: '/portal' });
		if (error) {
			pending = null;
			toast.error(error.message ?? 'Could not link that account');
		}
		// on success Better Auth redirects to the provider
	}
</script>

{#if providers.length}
	<Card.Root>
		<Card.Header>
			<Card.Title>Sign-in options</Card.Title>
			<Card.Description>Link an account so you can sign in without a password.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-wrap gap-2">
			{#each providers as p (p)}
				{@const isLinked = linked.has(p)}
				<Button
					variant="outline"
					size="sm"
					disabled={isLinked || pending != null}
					onclick={() => link(p)}
				>
					<svg viewBox="0 0 24 24" class="size-4" aria-hidden="true"
						><path fill="currentColor" d={SOCIAL_ICONS[p]} /></svg
					>
					{isLinked ? `${SOCIAL_LABELS[p]} linked` : `Link ${SOCIAL_LABELS[p]}`}
					{#if isLinked}<Check class="size-3.5 text-primary" />{/if}
				</Button>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
