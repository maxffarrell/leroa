<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import MessageThread from '#lib/components/app/message-thread.svelte';
	import { getPortalMessages, sendPortalMessage } from '#lib/remote/messaging.remote.ts';

	const threads = $derived(await getPortalMessages());

	// Keep the "New" divider where it was when the page was opened.
	const readOnOpen: Record<string, Date | null> = {};
	const readAt = (t: { tenantId: string; lastReadAt: Date | null }) => {
		if (!(t.tenantId in readOnOpen)) readOnOpen[t.tenantId] = t.lastReadAt;
		return readOnOpen[t.tenantId] ?? null;
	};

	$effect(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void getPortalMessages().refresh();
		}, 15_000);
		return () => clearInterval(timer);
	});
</script>

{#each threads as t (t.tenantId)}
	<Card.Root id="messages" class="gap-0 overflow-hidden pb-0">
		<Card.Header class="border-b pb-4">
			<Card.Title>Messages</Card.Title>
			<Card.Description>Questions for {t.orgName}? Send them here.</Card.Description>
		</Card.Header>
		<MessageThread
			class="h-[28rem] max-h-[70svh]"
			side="tenant"
			messages={t.messages}
			lastReadAt={readAt(t)}
			placeholder="Message {t.orgName}…"
			onsend={(body) => sendPortalMessage({ tenantId: t.tenantId, body })}
		>
			{#snippet empty()}
				<p class="py-10 text-center text-sm text-muted-foreground">
					No messages yet. For repairs, use Request maintenance so it's tracked.
				</p>
			{/snippet}
		</MessageThread>
	</Card.Root>
{/each}
