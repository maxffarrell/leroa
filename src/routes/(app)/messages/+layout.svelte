<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import ThreadList from '#lib/components/app/thread-list.svelte';
	import NewMessageDialog from '#lib/components/app/new-message-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { getThreads, getUnreadCount } from '#lib/remote/messaging.remote.ts';
	import { cn } from '#lib/utils.js';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';

	let { children } = $props();

	const threads = $derived(await getThreads());
	const selected = $derived(page.params.tenantId ?? null);
	const onAnnouncements = $derived(page.url.pathname.startsWith('/messages/announcements'));
	const unread = $derived(threads.filter((t) => t.unread).length);
	let composing = $state(page.url.searchParams.has('new'));

	$effect(() => {
		const timer = setInterval(() => {
			if (document.visibilityState !== 'visible') return;
			void getThreads().refresh();
			void getUnreadCount().refresh();
		}, 20_000);
		return () => clearInterval(timer);
	});

	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
		if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
		if (e.key === 'c' && !onAnnouncements) {
			e.preventDefault();
			composing = true;
		}
	}

	const tabClass = (active: boolean) =>
		cn(
			'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
			active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
		);
</script>

<svelte:window {onkeydown} />

<PageHeader title="Messages">
	{#snippet actions()}
		{#if onAnnouncements}
			<Button size="sm" href="/messages/announcements?new=1"
				><Megaphone /> <span class="hidden sm:inline">New announcement</span></Button
			>
		{:else}
			<Button size="sm" onclick={() => (composing = true)}
				><SquarePen /> <span class="hidden sm:inline">New message</span>
				<Kbd class="hidden sm:inline-flex">C</Kbd></Button
			>
		{/if}
	{/snippet}
</PageHeader>

<nav
	class={cn('flex gap-1 border-b px-4 py-1.5 md:px-6', selected && 'hidden md:flex')}
	aria-label="Messages"
>
	<a href="/messages" class={tabClass(!onAnnouncements)}
		>Inbox {#if unread}<span
				class="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums"
				>{unread}</span
			>{/if}</a
	>
	<a href="/messages/announcements" class={tabClass(onAnnouncements)}>Announcements</a>
</nav>

{#if onAnnouncements}
	{@render children()}
{:else}
	<div
		class="grid h-[calc(100svh-3.5rem)] min-h-96 md:h-[calc(100svh-6.25rem)] md:grid-cols-[20rem_1fr]"
	>
		<aside
			class={cn('min-h-0 overflow-y-auto md:border-r', selected && 'hidden md:block')}
			aria-label="Conversations"
		>
			<ThreadList {threads} {selected}>
				{#snippet empty()}
					<Empty.Root>
						<Empty.Header>
							<Empty.Media variant="icon"><MessagesSquare /></Empty.Media>
							<Empty.Title>No messages yet</Empty.Title>
							<Empty.Description
								>Message a tenant and they can reply from the resident portal. Everything stays in
								one thread per tenant.</Empty.Description
							>
						</Empty.Header>
						<Empty.Content
							><Button onclick={() => (composing = true)}><SquarePen /> New message</Button
							></Empty.Content
						>
					</Empty.Root>
				{/snippet}
			</ThreadList>
		</aside>
		<section class={cn('min-h-0 min-w-0 flex-col', selected ? 'flex' : 'hidden md:flex')}>
			{@render children()}
		</section>
	</div>
{/if}

<NewMessageDialog bind:open={composing} />
