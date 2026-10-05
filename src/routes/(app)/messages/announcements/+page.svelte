<script lang="ts">
	import { page } from '$app/state';
	import AnnouncementDialog from '#lib/components/app/announcement-dialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { deleteAnnouncement, getAnnouncements } from '#lib/remote/messaging.remote.ts';
	import { formatDate } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Trash from '@lucide/svelte/icons/trash-2';
	import Mail from '@lucide/svelte/icons/mail';

	const items = $derived(await getAnnouncements());
	let composing = $state(page.url.searchParams.has('new'));

	$effect(() => {
		if (page.url.searchParams.has('new')) composing = true;
	});

	async function remove(id: string, subject: string) {
		if (
			!confirm(
				`Remove "${subject}" from the resident portal? Emails already sent can't be recalled.`
			)
		)
			return;
		try {
			await deleteAnnouncement(id);
			toast.success('Announcement removed');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not remove');
		}
	}

	function onkeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
		if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
		if (e.key === 'c') {
			e.preventDefault();
			composing = true;
		}
	}
</script>

<svelte:window {onkeydown} />

<main class="mx-auto max-w-3xl p-4 md:p-6">
	{#if items.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon"><Megaphone /></Empty.Media>
				<Empty.Title>No announcements yet</Empty.Title>
				<Empty.Description
					>Post a notice to one property or all of them. Residents see it in their portal, and you
					can email it too.</Empty.Description
				>
			</Empty.Header>
			<Empty.Content
				><Button onclick={() => (composing = true)}><Megaphone /> New announcement</Button
				></Empty.Content
			>
		</Empty.Root>
	{:else}
		<ul class="space-y-3">
			{#each items as a (a.id)}
				<li class="rounded-lg border bg-card p-4">
					<div class="flex items-start gap-2">
						<div class="min-w-0 flex-1">
							<h3 class="font-medium">{a.subject}</h3>
							<p
								class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
							>
								<Badge variant="secondary">{a.propertyName ?? 'All properties'}</Badge>
								<span>{formatDate(a.createdAt)}{a.sentByName ? ` · ${a.sentByName}` : ''}</span>
								<span>{a.recipientCount} resident{a.recipientCount === 1 ? '' : 's'}</span>
								{#if a.emailed}<span class="inline-flex items-center gap-1"
										><Mail class="size-3" /> Emailed</span
									>{/if}
							</p>
						</div>
						<Button
							size="icon"
							variant="ghost"
							class="-mt-1 -mr-2 text-muted-foreground"
							aria-label="Remove announcement"
							onclick={() => remove(a.id, a.subject)}><Trash /></Button
						>
					</div>
					<p class="mt-3 line-clamp-6 text-sm whitespace-pre-wrap">{a.body}</p>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<AnnouncementDialog bind:open={composing} />
