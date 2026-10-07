<script lang="ts">
	import { goto } from '$app/navigation';
	import Bell from '@lucide/svelte/icons/bell';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { getInbox, markInboxRead } from '#lib/remote/notifications.remote.ts';
	import { formatRelative } from '#lib/format.ts';

	const inbox = $derived(await getInbox());
	let open = $state(false);

	async function read(ids: string[], href?: string | null) {
		await markInboxRead({ ids });
		open = false;
		if (href) goto(href);
	}

	async function markAll() {
		await markInboxRead({ ids: [], all: true });
	}
</script>

<Popover.Root
	bind:open
	onOpenChange={(v) => {
		if (v) void getInbox().refresh();
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class="relative" aria-label="Notifications">
				<Bell class="size-4" />
				{#if inbox.unread}
					<span
						class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground"
						>{inbox.unread > 99 ? '99+' : inbox.unread}</span
					>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-80 p-0 sm:w-96">
		<div class="flex items-center justify-between border-b px-4 py-2.5">
			<span class="text-sm font-medium">Notifications</span>
			{#if inbox.unread}
				<Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2 text-xs" onclick={markAll}>
					<CheckCheck class="size-3.5" /> Mark all read
				</Button>
			{/if}
		</div>
		{#if inbox.items.length === 0}
			<p class="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
		{:else}
			<ul class="max-h-96 divide-y overflow-y-auto">
				{#each inbox.items as n (n.id)}
					<li>
						<button
							class="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
							onclick={() => read([n.id], n.href)}
						>
							<span
								class="mt-1.5 size-2 shrink-0 rounded-full {n.readAt
									? 'bg-transparent'
									: 'bg-primary'}"
							></span>
							<span class="min-w-0 flex-1">
								<span
									class="block truncate text-sm {n.readAt
										? 'text-muted-foreground'
										: 'font-medium'}">{n.title}</span
								>
								{#if n.body}
									<span class="mt-0.5 line-clamp-2 block text-xs text-muted-foreground"
										>{n.body}</span
									>
								{/if}
								<span class="mt-1 block text-[11px] text-muted-foreground/70"
									>{formatRelative(n.createdAt)}</span
								>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</Popover.Content>
</Popover.Root>
