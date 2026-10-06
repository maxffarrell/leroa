<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { emailWaitlist, getWaitlist } from '#lib/remote/crm.remote.ts';
	import { leadName } from '#lib/leads.ts';
	import { toast } from 'svelte-sonner';
	import Check from '@lucide/svelte/icons/check';
	import Mail from '@lucide/svelte/icons/mail';

	let { listingId, published, demo }: { listingId: string; published: boolean; demo: boolean } =
		$props();
	const waiting = $derived(await getWaitlist(listingId));
	const pendingCount = $derived(waiting.filter((w) => w.email && !w.notified).length);
	let sending = $state(false);

	async function send() {
		sending = true;
		try {
			const { sent } = await emailWaitlist(listingId);
			toast.success(
				sent ? `Emailed ${sent} ${sent === 1 ? 'person' : 'people'}` : 'Nobody new to email'
			);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not send');
		} finally {
			sending = false;
		}
	}
</script>

<Card.Root size="sm">
	<Card.Header>
		<Card.Description>Waitlist</Card.Description>
		<Card.Title class="text-xl tabular-nums"
			>{waiting.length}
			<span class="text-sm font-normal text-muted-foreground">waiting</span></Card.Title
		>
	</Card.Header>
	{#if waiting.length}
		<Card.Content>
			<ul class="space-y-1.5 text-sm">
				{#each waiting.slice(0, 6) as w (w.id)}
					<li class="flex items-center gap-2">
						<a href="/leasing/leads/{w.id}" class="min-w-0 flex-1 truncate hover:underline"
							>{leadName(w)}</a
						>
						{#if w.notified}<span
								class="inline-flex items-center gap-0.5 text-xs text-emerald-700 dark:text-emerald-400"
								><Check class="size-3" />Emailed</span
							>{:else if !w.email}<span class="text-xs text-muted-foreground">No email</span>{/if}
					</li>
				{/each}
				{#if waiting.length > 6}<li class="text-xs text-muted-foreground">
						and {waiting.length - 6} more
					</li>{/if}
			</ul>
		</Card.Content>
		<Card.Footer>
			<Button
				size="sm"
				variant="outline"
				class="w-full"
				disabled={!published || !pendingCount || sending || demo}
				title={demo
					? 'Email is off in the public demo'
					: !published
						? 'Publish the listing first'
						: undefined}
				onclick={send}
				><Mail />
				{pendingCount ? `Email ${pendingCount} waiting` : 'Everyone emailed'}</Button
			>
		</Card.Footer>
	{:else}
		<Card.Content>
			<p class="text-xs text-muted-foreground">
				Nobody is waiting for a home like this. Leads join from your public pages or from their lead
				record.
			</p>
		</Card.Content>
	{/if}
</Card.Root>
