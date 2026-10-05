<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { deleteTemplate, getTemplates, saveTemplate } from '#lib/remote/agreements.remote.ts';
	import { MERGE_FIELDS, STARTER_TEMPLATE } from '#lib/agreements.ts';
	import { formatRelative } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import FileText from '@lucide/svelte/icons/file-text';
	import Plus from '@lucide/svelte/icons/plus';

	const templates = $derived(await getTemplates());
	const canEdit = $derived(page.data.role !== 'member');

	let editing = $state<{ id?: string; name: string; body: string } | null>(null);
	let pending = $state(false);
	let textarea = $state<HTMLTextAreaElement | null>(null);

	const fail = (err: unknown, fallback: string) =>
		toast.error((err as { body?: { message?: string } })?.body?.message ?? fallback);

	function insert(key: string) {
		if (!editing) return;
		const tag = `{{${key}}}`;
		const el = textarea;
		const at = el?.selectionStart ?? editing.body.length;
		const end = el?.selectionEnd ?? at;
		editing.body = editing.body.slice(0, at) + tag + editing.body.slice(end);
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(at + tag.length, at + tag.length);
		});
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		pending = true;
		try {
			await saveTemplate(editing);
			toast.success('Template saved');
			editing = null;
		} catch (err) {
			fail(err, 'Could not save');
		} finally {
			pending = false;
		}
	}

	async function remove(id: string, name: string) {
		if (!confirm(`Delete “${name}”? Agreements already created from it are kept.`)) return;
		await deleteTemplate(id).catch((err) => fail(err, 'Could not delete'));
	}
</script>

{#if editing}
	<Card.Root>
		<Card.Header>
			<Card.Title>{editing.id ? 'Edit template' : 'New template'}</Card.Title>
			<Card.Description
				>Start a line with <code class="font-mono text-xs"># </code> for a heading. Merge fields are filled
				in from the lease when you create an agreement.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<form class="space-y-4" onsubmit={save}>
				<Field.Field>
					<Field.Label for="tpl-name">Name</Field.Label>
					<Input id="tpl-name" required maxlength={200} bind:value={editing.name} />
				</Field.Field>
				<Field.Field>
					<Field.Label for="tpl-body">Document</Field.Label>
					<div class="flex flex-wrap gap-1.5" aria-label="Insert merge field">
						{#each MERGE_FIELDS as f (f.key)}
							<Button type="button" size="xs" variant="outline" onclick={() => insert(f.key)}
								>{f.label}</Button
							>
						{/each}
					</div>
					<Textarea
						id="tpl-body"
						rows={18}
						required
						class="font-mono text-xs leading-relaxed"
						bind:ref={textarea}
						bind:value={editing.body}
					/>
				</Field.Field>
				<div class="flex justify-end gap-2">
					<Button type="button" variant="ghost" onclick={() => (editing = null)}>Cancel</Button>
					<Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save template'}</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root>
		<Card.Header>
			<Card.Title>Lease templates</Card.Title>
			<Card.Description
				>Reusable lease documents. Create an agreement from a lease page and send it to tenants to
				sign in their portal. Have a local attorney review your templates; Leroa doesn't give legal
				advice.</Card.Description
			>
			{#if canEdit && templates.length}
				<Card.Action>
					<Button size="sm" onclick={() => (editing = { name: '', body: '' })}
						><Plus /> New template</Button
					>
				</Card.Action>
			{/if}
		</Card.Header>
		<Card.Content class={templates.length ? 'px-0' : ''}>
			{#if templates.length}
				<ul class="divide-y border-t">
					{#each templates as t (t.id)}
						<li class="flex items-center gap-3 px-6 py-3 text-sm">
							<FileText class="size-4 shrink-0 text-muted-foreground" />
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">{t.name}</p>
								<p class="text-xs text-muted-foreground">Updated {formatRelative(t.updatedAt)}</p>
							</div>
							{#if canEdit}
								<Button
									size="sm"
									variant="ghost"
									onclick={() => (editing = { id: t.id, name: t.name, body: t.body })}>Edit</Button
								>
								<Button size="sm" variant="ghost" onclick={() => remove(t.id, t.name)}
									>Delete</Button
								>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<Empty.Root class="border border-dashed">
					<Empty.Header>
						<Empty.Media variant="icon"><FileText /></Empty.Media>
						<Empty.Title>No templates yet</Empty.Title>
						<Empty.Description
							>Start from a plain-English residential lease and edit it to fit your properties.</Empty.Description
						>
					</Empty.Header>
					{#if canEdit}
						<Empty.Content class="flex-row justify-center gap-2">
							<Button size="sm" onclick={() => (editing = { ...STARTER_TEMPLATE })}
								>Use starter lease</Button
							>
							<Button size="sm" variant="outline" onclick={() => (editing = { name: '', body: '' })}
								>Blank template</Button
							>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{/if}
		</Card.Content>
	</Card.Root>
{/if}
