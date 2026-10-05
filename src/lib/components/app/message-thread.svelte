<script lang="ts">
	import * as Message from '#lib/components/ui/message/index.js';
	import * as Bubble from '#lib/components/ui/bubble/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { cn } from '#lib/utils.js';
	import { toast } from 'svelte-sonner';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import type { Snippet } from 'svelte';

	type Side = 'staff' | 'tenant';
	type Msg = { id: string; authorType: Side; authorName: string; body: string; createdAt: Date };

	let {
		messages,
		side,
		lastReadAt = null,
		otherReadAt = null,
		onsend,
		placeholder = 'Write a message…',
		empty,
		class: className
	}: {
		messages: Msg[];
		side: Side;
		lastReadAt?: Date | null;
		otherReadAt?: Date | null;
		onsend: (body: string) => Promise<unknown>;
		placeholder?: string;
		empty?: Snippet;
		class?: string;
	} = $props();

	let body = $state('');
	let sending = $state(false);
	let scroller = $state<HTMLDivElement | null>(null);

	const GROUP_MS = 5 * 60_000;
	const time = (d: Date) => new Date(d).getTime();

	const firstNew = $derived(
		messages.findIndex(
			(m) => m.authorType !== side && (!lastReadAt || time(m.createdAt) > time(lastReadAt))
		)
	);
	const lastMine = $derived(messages.findLastIndex((m) => m.authorType === side));
	const seen = $derived(
		lastMine >= 0 && !!otherReadAt && time(otherReadAt) >= time(messages[lastMine]!.createdAt)
	);

	const startsRun = (i: number) => {
		const m = messages[i]!;
		const prev = messages[i - 1];
		return (
			!prev ||
			i === firstNew ||
			prev.authorName !== m.authorName ||
			prev.authorType !== m.authorType ||
			time(m.createdAt) - time(prev.createdAt) > GROUP_MS
		);
	};

	const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
	function stamp(d: Date) {
		const date = new Date(d);
		const today = new Date().toDateString() === date.toDateString();
		return today ? timeFmt.format(date) : `${dayFmt.format(date)}, ${timeFmt.format(date)}`;
	}

	$effect(() => {
		void messages.length;
		scroller?.scrollTo({ top: scroller.scrollHeight });
	});

	async function send() {
		const text = body.trim();
		if (!text || sending) return;
		sending = true;
		try {
			await onsend(text);
			body = '';
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not send');
		} finally {
			sending = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			void send();
		}
	}
</script>

<div class={cn('flex min-h-0 flex-col', className)}>
	<div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
		{#if messages.length === 0}
			{@render empty?.()}
		{:else}
			<Message.Group class="gap-1">
				{#each messages as m, i (m.id)}
					{@const mine = m.authorType === side}
					{#if i === firstNew}
						<div class="my-2 flex items-center gap-2 text-xs font-medium text-primary">
							<span class="h-px flex-1 bg-primary/30"></span>New<span
								class="h-px flex-1 bg-primary/30"
							></span>
						</div>
					{/if}
					<Message.Root align={mine ? 'end' : 'start'} class={startsRun(i) ? 'mt-2' : ''}>
						<Message.Content class="gap-1">
							{#if startsRun(i)}
								<Message.Header class="gap-1.5 px-1">
									<span>{mine && side === 'tenant' ? 'You' : m.authorName}</span>
									<time class="font-normal" datetime={new Date(m.createdAt).toISOString()}
										>{stamp(m.createdAt)}</time
									>
								</Message.Header>
							{/if}
							<Bubble.Root variant={mine ? 'default' : 'muted'} align={mine ? 'end' : 'start'}>
								<Bubble.Content class="whitespace-pre-wrap">{m.body}</Bubble.Content>
							</Bubble.Root>
							{#if i === lastMine && seen}
								<Message.Footer class="px-1 font-normal">Seen</Message.Footer>
							{/if}
						</Message.Content>
					</Message.Root>
				{/each}
			</Message.Group>
		{/if}
	</div>
	<form
		class="flex items-end gap-2 border-t bg-background p-3"
		onsubmit={(e) => {
			e.preventDefault();
			void send();
		}}
	>
		<Textarea
			bind:value={body}
			{placeholder}
			rows={1}
			maxlength={5000}
			class="max-h-40 min-h-10 resize-none"
			aria-label="Message"
			{onkeydown}
		/>
		<Button type="submit" size="icon" disabled={sending || !body.trim()} aria-label="Send"
			><SendHorizontal /></Button
		>
	</form>
</div>
