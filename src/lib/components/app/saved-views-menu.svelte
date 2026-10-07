<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { deleteView, getSavedViews, saveViewAs } from '#lib/remote/views.remote.ts';
	import Bookmark from '@lucide/svelte/icons/bookmark';
	import Check from '@lucide/svelte/icons/check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import X from '@lucide/svelte/icons/x';

	type ViewState = Record<string, unknown>;
	type SavedView = Awaited<ReturnType<typeof getSavedViews>>[number];

	let {
		page: key,
		current,
		onapply
	}: {
		page: string;
		current: () => ViewState;
		onapply: (state: ViewState) => void;
	} = $props();

	const views = $derived(await getSavedViews(key));
	const meId = $derived(page.data.user.id);
	const isAdmin = $derived(page.data.role !== 'member');
	const canDelete = (v: SavedView) => isAdmin || v.createdBy === meId;

	let naming = $state(false);
	let name = $state('');
	let saving = $state(false);

	function summarize(state: ViewState) {
		const parts: string[] = [];
		for (const [k, v] of Object.entries(state)) {
			if (v == null || v === '' || v === false) continue;
			if (Array.isArray(v) && !v.length) continue;
			if (k === 'sorting' && Array.isArray(v))
				parts.push(`sorted by ${(v as { id: string }[]).map((s) => s.id).join(', ')}`);
			else if (typeof v === 'boolean') parts.push(k);
			else parts.push(`${k}: ${String(v)}`);
		}
		return parts.join(' · ') || 'no filters';
	}

	async function save() {
		if (!name.trim()) return;
		saving = true;
		try {
			await saveViewAs({ page: key, name: name.trim(), state: current() });
			toast.success(`Saved view “${name.trim()}”`);
			name = '';
			naming = false;
		} catch (e) {
			toast.error((e as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		} finally {
			saving = false;
		}
	}

	async function remove(v: SavedView, e: Event) {
		e.stopPropagation();
		await deleteView(v.id);
		void getSavedViews(key).refresh();
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm" class="h-8 gap-1.5">
				<Bookmark class="size-3.5" />
				<span class="hidden sm:inline">Views</span>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-72">
		{#if naming}
			<div class="flex items-center gap-1.5 p-2">
				<Input
					class="h-8"
					placeholder="Name this view…"
					bind:value={name}
					autofocus
					onkeydown={(e) => {
						if (e.key === 'Enter') save();
						if (e.key === 'Escape') naming = false;
					}}
				/>
				<Button size="icon" class="size-8 shrink-0" onclick={save} disabled={saving || !name.trim()}
					><Check class="size-4" /></Button
				>
				<Button size="icon" variant="ghost" class="size-8 shrink-0" onclick={() => (naming = false)}
					><X class="size-4" /></Button
				>
			</div>
			<p class="px-2 pb-2 text-xs text-muted-foreground">Current: {summarize(current())}</p>
		{:else}
			{#each views as v (v.id)}
				<DropdownMenu.Item class="flex-col items-start gap-0.5" onclick={() => onapply(v.state)}>
					<span class="flex w-full items-center gap-2">
						<span class="truncate">{v.name}</span>
						{#if canDelete(v)}
							<button
								class="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
								aria-label="Delete view {v.name}"
								onclick={(e) => remove(v, e)}
							>
								<Trash2 class="size-3.5" />
							</button>
						{/if}
					</span>
					<span class="line-clamp-1 text-xs font-normal text-muted-foreground"
						>{summarize(v.state)}{v.creatorName ? ` · ${v.creatorName}` : ''}</span
					>
				</DropdownMenu.Item>
			{/each}
			{#if views.length}<DropdownMenu.Separator />{/if}
			<DropdownMenu.Item closeOnSelect={false} onclick={() => (naming = true)}>
				<Bookmark class="size-4" /> Save current view
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
