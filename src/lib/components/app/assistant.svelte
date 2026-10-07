<script lang="ts">
	import { aiAsk } from '#lib/remote/ai.remote.ts';
	import { createTicket } from '#lib/remote/maintenance.remote.ts';
	import { sendMessage } from '#lib/remote/messaging.remote.ts';
	import { toast } from 'svelte-sonner';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Bubble from '#lib/components/ui/bubble/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import type { AssistantAction } from '#lib/server/ai/assistant.ts';

	type Msg = {
		role: 'user' | 'assistant';
		text: string;
		sources?: { label: string; href: string }[];
		action?: AssistantAction | null;
		done?: boolean;
	};

	let open = $state(false);
	let input = $state('');
	let busy = $state(false);
	let msgs = $state<Msg[]>([]);
	let scroller = $state<HTMLDivElement>();

	const suggestions = [
		"What's vacant right now?",
		'Which leases expire soon?',
		'Anyone behind on rent?',
		'Any urgent tickets?',
		'Draft a work order for a leaking sink in 101'
	];

	async function ask(question: string) {
		const q = question.trim();
		if (!q || busy) return;
		msgs.push({ role: 'user', text: q });
		input = '';
		busy = true;
		try {
			const a = await aiAsk({ question: q });
			msgs.push({ role: 'assistant', text: a.reply, sources: a.sources, action: a.action });
		} catch (err) {
			msgs.push({
				role: 'assistant',
				text:
					(err as { body?: { message?: string } })?.body?.message ??
					'Something went wrong — try again.'
			});
		} finally {
			busy = false;
			queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
		}
	}

	async function confirmTicket(m: Msg) {
		if (m.action?.type !== 'create_ticket') return;
		try {
			const t = await createTicket(m.action.input);
			m.done = true;
			toast.success(`Created ticket #${t.number}`, {
				action: { label: 'Open', onClick: () => (location.href = '/maintenance') }
			});
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not create');
		}
	}

	async function confirmReply(m: Msg, body: string) {
		if (m.action?.type !== 'draft_reply' || !body.trim()) return;
		try {
			await sendMessage({ tenantId: m.action.tenantId, body: body.trim() });
			m.action.body = body.trim();
			m.done = true;
			toast.success(`Sent to ${m.action.tenantName}`, {
				action: {
					label: 'Open thread',
					onClick: () =>
						(location.href = `/messages/${m.action?.type === 'draft_reply' ? m.action.tenantId : ''}`)
				}
			});
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not send');
		}
	}
</script>

<Button
	class="fixed right-4 bottom-4 z-40 size-11 rounded-full shadow-lg"
	size="icon"
	aria-label="Open assistant"
	onclick={() => (open = true)}
>
	<Sparkles class="size-5" />
</Button>

<Sheet.Root bind:open>
	<Sheet.Content class="flex w-full flex-col gap-0 p-0 sm:max-w-md" side="right">
		<Sheet.Header class="border-b p-4">
			<Sheet.Title class="flex items-center gap-2">
				<Sparkles class="size-4" /> Assistant
			</Sheet.Title>
			<Sheet.Description>
				Answers grounded in your workspace. It drafts — you confirm.
			</Sheet.Description>
		</Sheet.Header>

		<div
			bind:this={scroller}
			class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
			aria-live="polite"
		>
			{#if msgs.length === 0}
				<div class="space-y-3 pt-2">
					<p class="text-sm text-muted-foreground">Ask anything about your portfolio:</p>
					<div class="flex flex-wrap gap-2">
						{#each suggestions as s (s)}
							<button
								class="rounded-full border px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
								onclick={() => void ask(s)}>{s}</button
							>
						{/each}
					</div>
				</div>
			{:else}
				{#each msgs as m (m)}
					<Bubble.Root
						variant={m.role === 'user' ? 'default' : 'muted'}
						align={m.role === 'user' ? 'end' : 'start'}
					>
						<Bubble.Content class="whitespace-pre-wrap">{m.text}</Bubble.Content>
					</Bubble.Root>
					{#if m.sources?.length}
						<div class="flex flex-wrap gap-1.5 pl-1">
							{#each m.sources as s (s.href)}
								<a class="text-xs text-primary underline-offset-2 hover:underline" href={s.href}
									>{s.label}</a
								>
							{/each}
						</div>
					{/if}
					{#if m.action?.type === 'create_ticket'}
						<div class="space-y-2 rounded-lg border bg-muted/40 p-3">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium">{m.action.input.title}</span>
								<Badge variant={m.action.input.priority === 'urgent' ? 'destructive' : 'secondary'}
									>{m.action.input.priority}</Badge
								>
							</div>
							{#if m.done}
								<p class="text-xs text-muted-foreground">Ticket created.</p>
							{:else}
								<Button size="sm" onclick={() => void confirmTicket(m)}>Create ticket</Button>
							{/if}
						</div>
					{:else if m.action?.type === 'draft_reply'}
						<div class="space-y-2 rounded-lg border bg-muted/40 p-3">
							<p class="text-xs font-medium text-muted-foreground">To {m.action.tenantName}</p>
							{#if m.done}
								<p class="text-sm whitespace-pre-wrap">{m.action.body}</p>
								<a
									class="text-xs text-primary underline-offset-2 hover:underline"
									href="/messages/{m.action.tenantId}">Open thread</a
								>
							{:else}
								<Textarea bind:value={m.action.body} rows={4} class="text-sm" />
								<Button
									size="sm"
									onclick={() =>
										m.action?.type === 'draft_reply' && void confirmReply(m, m.action.body)}
									>Send</Button
								>
							{/if}
						</div>
					{/if}
				{/each}
				{#if busy}
					<Bubble.Root variant="muted" align="start">
						<Bubble.Content class="text-muted-foreground">Thinking…</Bubble.Content>
					</Bubble.Root>
				{/if}
			{/if}
		</div>

		<form
			class="flex items-end gap-2 border-t bg-background p-3"
			onsubmit={(e) => {
				e.preventDefault();
				void ask(input);
			}}
		>
			<Textarea
				bind:value={input}
				rows={1}
				placeholder="Ask about units, leases, tickets…"
				class="max-h-32 min-h-9 flex-1 resize-none"
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
						e.preventDefault();
						void ask(input);
					}
				}}
			/>
			<Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Ask">
				<SendHorizontal class="size-4" />
			</Button>
		</form>
	</Sheet.Content>
</Sheet.Root>
