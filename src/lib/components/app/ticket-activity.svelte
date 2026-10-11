<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { addTicketNote, getTicketActivity } from '#lib/remote/maintenance.remote.ts';
	import { formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import Lock from '@lucide/svelte/icons/lock';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	let { ticketId }: { ticketId: string } = $props();
	const a = $derived(await getTicketActivity(ticketId));

	let body = $state('');
	let internal = $state(false);
	let pending = $state(false);
	let uploading = $state(false);

	async function addNote(e: SubmitEvent) {
		e.preventDefault();
		pending = true;
		try {
			await addTicketNote({ ticketId, body, internal });
			body = '';
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not add note');
		} finally {
			pending = false;
		}
	}

	async function upload(files: FileList | null) {
		const images = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (!images.length) return;
		uploading = true;
		try {
			const form = new FormData();
			for (const f of images) form.append('file', f);
			form.set('entityType', 'maintenance');
			form.set('entityId', ticketId);
			const res = await fetch('/api/documents', { method: 'POST', body: form });
			if (!res.ok) toast.error((await res.json().catch(() => null))?.message ?? 'Upload failed');
			await getTicketActivity(ticketId).refresh();
		} finally {
			uploading = false;
		}
	}

	const tag = { staff: null, vendor: 'Vendor', tenant: 'Resident' } as const;
</script>

<section class="space-y-2">
	<h3 class="text-sm font-medium">Photos</h3>
	<ul class="grid grid-cols-4 gap-2">
		{#each a.photos as p (p.id)}
			<li class="aspect-square overflow-hidden rounded-md bg-muted">
				<a href="/api/documents/{p.id}" target="_blank" rel="noreferrer"
					><img
						src="/api/documents/{p.id}"
						alt={p.name}
						loading="lazy"
						class="size-full object-cover"
					/></a
				>
			</li>
		{/each}
		<li>
			<label
				class="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[11px] text-muted-foreground hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
			>
				<ImagePlus class="size-4" />{uploading ? 'Uploading…' : 'Add'}
				<input
					type="file"
					accept="image/*"
					multiple
					class="sr-only"
					disabled={uploading}
					onchange={(e) => {
						void upload(e.currentTarget.files);
						e.currentTarget.value = '';
					}}
				/>
			</label>
		</li>
	</ul>
</section>

<section class="space-y-2">
	<h3 class="text-sm font-medium">Notes</h3>
	{#if a.notes.length}
		<ol class="space-y-2">
			{#each a.notes as n (n.id)}
				<li class="rounded-md p-2.5 text-sm {n.internal ? 'border border-dashed' : 'bg-muted/50'}">
					<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
						<span class="font-medium text-foreground">{n.authorName}</span>
						{#if tag[n.authorType]}<span class="rounded bg-background px-1"
								>{tag[n.authorType]}</span
							>{/if}
						{#if n.internal}<Lock class="size-3" /><span>Internal</span>{/if}
						<span class="ml-auto">{formatRelative(n.createdAt)}</span>
					</p>
					<p class="mt-1 whitespace-pre-line">{n.body}</p>
				</li>
			{/each}
		</ol>
	{/if}
	<form class="space-y-2" onsubmit={addNote}>
		<Textarea
			rows={2}
			placeholder={internal ? 'Only your team sees this…' : 'Visible to the assigned vendor…'}
			aria-label="New note"
			bind:value={body}
		/>
		<div class="flex items-center gap-3">
			<span class="flex items-center gap-2 text-xs text-muted-foreground">
				<Checkbox id="ticket-internal" bind:checked={internal} />
				<Label for="ticket-internal" class="font-normal">Internal only</Label>
			</span>
			<Button type="submit" size="sm" class="ml-auto" disabled={pending || !body.trim()}
				>{pending ? 'Adding…' : 'Add note'}</Button
			>
		</div>
	</form>
</section>
