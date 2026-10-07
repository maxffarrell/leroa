<script lang="ts">
	import PageHeader from '#lib/components/app/page-header.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as FileDropZone from '#lib/components/ui/file-drop-zone/index.js';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';
	import { getDocuments, deleteDocument } from '#lib/remote/documents.remote.ts';
	import { formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Upload from '@lucide/svelte/icons/upload';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileImage from '@lucide/svelte/icons/file-image';
	import FileIcon from '@lucide/svelte/icons/file';
	import Trash from '@lucide/svelte/icons/trash-2';

	const docs = $derived(await getDocuments());
	let filter = $state('');
	let uploading = $state(false);
	const rows = $derived(
		filter ? docs.filter((d) => d.name.toLowerCase().includes(filter.toLowerCase())) : docs
	);

	const size = (n: number) =>
		n < 1024
			? `${n} B`
			: n < 1048576
				? `${(n / 1024).toFixed(0)} KB`
				: `${(n / 1048576).toFixed(1)} MB`;
	const icon = (type: string) =>
		type.startsWith('image/')
			? FileImage
			: type === 'application/pdf' || type.startsWith('text/')
				? FileText
				: FileIcon;

	async function upload(files: File[]): Promise<void> {
		if (!files.length) return;
		uploading = true;
		const body = new FormData();
		for (const f of files) body.append('file', f);
		const res = await fetch('/api/documents', { method: 'POST', body });
		uploading = false;
		if (!res.ok) {
			toast.error((await res.json().catch(() => null))?.message ?? 'Upload failed');
			return;
		}
		toast.success(files.length === 1 ? 'File uploaded' : `${files.length} files uploaded`);
		await getDocuments().refresh();
	}

	function remove(id: string, name: string) {
		confirmDelete({
			title: `Delete ${name}?`,
			description: 'This file is permanently removed from the workspace.',
			onConfirm: async () => {
				await deleteDocument(id).catch(() => toast.error('Could not delete'));
			}
		});
	}
</script>

<FileDropZone.Root
	id="doc-upload"
	maxFileSize={10 * FileDropZone.MEGABYTE}
	onUpload={upload}
	onFileRejected={(e) => toast.error(`${e.file.name}: ${e.reason}`)}
>
	<FileDropZone.DragOverlay />

	<PageHeader title="Documents">
		{#snippet actions()}
			<Button
				size="sm"
				disabled={uploading}
				onclick={() => document.getElementById('doc-upload')?.click()}
				><Upload /> {uploading ? 'Uploading…' : 'Upload'}</Button
			>
		{/snippet}
	</PageHeader>

	<main class="relative p-4 md:p-6">
		{#if docs.length === 0}
			<FileDropZone.Trigger>
				<div
					class="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-12 text-center transition-colors hover:bg-muted/40"
				>
					<Upload class="size-6 text-muted-foreground" />
					<span class="font-medium">Drop leases, inspection photos or IDs here</span>
					<span class="text-sm text-muted-foreground"
						>or click to browse. Up to 10 MB per file.</span
					>
				</div>
			</FileDropZone.Trigger>
		{:else}
			<Input placeholder="Filter files…" class="mb-4 max-w-xs" bind:value={filter} />
			<div class="overflow-hidden rounded-lg border">
				<Table.Root>
					<Table.Header
						><Table.Row
							><Table.Head>Name</Table.Head><Table.Head class="hidden sm:table-cell"
								>Size</Table.Head
							><Table.Head class="hidden md:table-cell">Uploaded</Table.Head><Table.Head
								class="w-10"
							></Table.Head></Table.Row
						></Table.Header
					>
					<Table.Body>
						{#each rows as d (d.id)}
							{@const Icon = icon(d.contentType)}
							<Table.Row>
								<Table.Cell
									><a
										class="flex items-center gap-2 font-medium hover:underline"
										href="/api/documents/{d.id}"
										target="_blank"
										rel="noopener"><Icon class="size-4 text-muted-foreground" />{d.name}</a
									></Table.Cell
								>
								<Table.Cell class="hidden text-muted-foreground tabular-nums sm:table-cell"
									>{size(d.size)}</Table.Cell
								>
								<Table.Cell class="hidden text-muted-foreground md:table-cell"
									>{formatRelative(d.createdAt)}{d.uploadedBy
										? ` by ${d.uploadedBy}`
										: ''}</Table.Cell
								>
								<Table.Cell
									><Button
										size="icon-sm"
										variant="ghost"
										aria-label="Delete {d.name}"
										onclick={() => remove(d.id, d.name)}><Trash /></Button
									></Table.Cell
								>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	</main>
</FileDropZone.Root>
