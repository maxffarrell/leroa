<script lang="ts" module>
	const seenUntil: Record<string, number> = {};
</script>

<script lang="ts">
	import { page } from '$app/state';
	import MessageThread from '#lib/components/app/message-thread.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		getThread,
		getThreads,
		getUnreadCount,
		sendMessage
	} from '#lib/remote/messaging.remote.ts';
	import { aiDraftReply } from '#lib/remote/ai.remote.ts';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import UserRound from '@lucide/svelte/icons/user-round';
	import Info from '@lucide/svelte/icons/info';

	const id = $derived(page.params.tenantId!);
	const th = $derived(await getThread(id));

	// Key off the loaded thread, not the URL: while the next thread loads, `th` still holds
	// the previous one.
	const tid = $derived(th.tenant.id);

	// Keep the "New" divider where it was when the conversation was opened. The cached thread
	// can be stale on revisit, so also count what this tab already showed.
	let opened: { id: string; readAt: Date | null } | null = null;
	const readAt = $derived.by(() => {
		if (opened?.id !== tid) {
			const shown = seenUntil[tid];
			const server = th.lastReadAt ? new Date(th.lastReadAt).getTime() : 0;
			const at = Math.max(server, shown ?? 0);
			opened = { id: tid, readAt: at ? new Date(at) : null };
		}
		return opened.readAt;
	});
	$effect(() => {
		const last = th.messages.at(-1);
		if (last) seenUntil[th.tenant.id] = new Date(last.createdAt).getTime();
	});

	// <svelte:head> covers SSR; after an async thread switch it can keep the old title.
	const title = $derived(`${th.tenant.name} · Messages · Leroa`);
	$effect(() => {
		document.title = title;
	});

	const latest = $derived(`${tid}:${th.messages.at(-1)?.id ?? ''}`);
	$effect(() => {
		void latest;
		void getThreads().refresh();
		void getUnreadCount().refresh();
	});

	$effect(() => {
		const tenantId = id;
		void getThread(tenantId).refresh();
		const timer = setInterval(() => {
			if (document.visibilityState === 'visible') void getThread(tenantId).refresh();
		}, 10_000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

{#key tid}
	<header class="flex items-center gap-2 border-b px-3 py-2">
		<Button size="icon" variant="ghost" class="md:hidden" href="/messages" aria-label="Back"
			><ArrowLeft /></Button
		>
		<div class="min-w-0 flex-1">
			<h2 class="truncate text-sm font-semibold">{th.tenant.name}</h2>
			{#if th.tenant.unitName}<p class="truncate text-xs text-muted-foreground">
					{th.tenant.propertyName} · {th.tenant.unitName}
				</p>{/if}
		</div>
		<Button size="sm" variant="ghost" href="/tenants/{th.tenant.id}"
			><UserRound /> <span class="hidden sm:inline">Profile</span></Button
		>
	</header>
	{#if !th.tenant.portalLinked}
		<p class="flex items-start gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
			<Info class="mt-px size-3.5 shrink-0" />
			{#if th.tenant.email}
				{th.tenant.name} isn't on the resident portal yet. They'll get your messages by email and can
				reply once you send them a portal invite from their profile.
			{:else}
				{th.tenant.name} has no email or portal login, so they won't see messages yet. Add an email or
				send a portal invite from their profile.
			{/if}
		</p>
	{/if}
	<MessageThread
		class="flex-1"
		side="staff"
		messages={th.messages}
		lastReadAt={readAt}
		otherReadAt={th.residentReadAt}
		placeholder="Message {th.tenant.name.split(' ')[0]}…"
		onsend={(body) => sendMessage({ tenantId: tid, body })}
		ondraft={page.data.ai ? () => aiDraftReply(tid) : undefined}
		showCategories={page.data.ai}
	>
		{#snippet empty()}
			<p class="py-10 text-center text-sm text-muted-foreground">
				No messages with {th.tenant.name} yet. Say hello below.
			</p>
		{/snippet}
	</MessageThread>
{/key}
