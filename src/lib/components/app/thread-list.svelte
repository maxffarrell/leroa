<script lang="ts">
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { cn } from '#lib/utils.js';
	import { initials } from '#lib/format.ts';
	import type { Snippet } from 'svelte';

	type Thread = {
		id: string;
		tenantId: string;
		name: string;
		preview: string;
		lastAuthorType: 'staff' | 'tenant';
		lastMessageAt: Date;
		unread: boolean;
		unitName: string | null;
		propertyName: string | null;
	};

	let {
		threads,
		selected = null,
		empty
	}: { threads: Thread[]; selected?: string | null; empty?: Snippet } = $props();

	let filter = $state('');
	const shown = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return threads;
		return threads.filter((t) =>
			[t.name, t.unitName, t.propertyName, t.preview].some((s) => s?.toLowerCase().includes(q))
		);
	});

	const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
	function when(d: Date) {
		const date = new Date(d);
		return new Date().toDateString() === date.toDateString()
			? timeFmt.format(date)
			: dayFmt.format(date);
	}
</script>

{#if threads.length === 0}
	{@render empty?.()}
{:else}
	<div class="sticky top-0 z-[1] border-b bg-background p-2">
		<Input
			bind:value={filter}
			placeholder="Filter conversations"
			aria-label="Filter conversations"
			class="h-8"
		/>
	</div>
	<ul class="divide-y">
		{#each shown as t (t.id)}
			<li>
				<a
					href="/messages/{t.tenantId}"
					aria-current={selected === t.tenantId ? 'page' : undefined}
					class={cn(
						'flex gap-3 px-3 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted',
						selected === t.tenantId && 'bg-muted'
					)}
				>
					<Avatar.Root class="size-9 shrink-0"
						><Avatar.Fallback class="text-xs">{initials(t.name)}</Avatar.Fallback></Avatar.Root
					>
					<div class="min-w-0 flex-1">
						<div class="flex items-baseline gap-2">
							<span class={cn('truncate text-sm', t.unread ? 'font-semibold' : 'font-medium')}
								>{t.name}</span
							>
							<span class="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
								>{when(t.lastMessageAt)}</span
							>
						</div>
						{#if t.unitName}
							<div class="truncate text-xs text-muted-foreground">
								{t.propertyName} · {t.unitName}
							</div>
						{/if}
						<div class="flex items-center gap-2">
							<p
								class={cn(
									'truncate text-sm',
									t.unread ? 'text-foreground' : 'text-muted-foreground'
								)}
							>
								{t.lastAuthorType === 'staff' ? 'You: ' : ''}{t.preview}
							</p>
							{#if t.unread}<span
									class="ml-auto size-2 shrink-0 rounded-full bg-primary"
									aria-label="Unread"
								></span>{/if}
						</div>
					</div>
				</a>
			</li>
		{:else}
			<li class="p-6 text-center text-sm text-muted-foreground">No conversations match.</li>
		{/each}
	</ul>
{/if}
