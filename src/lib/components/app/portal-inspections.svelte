<script lang="ts">
	import * as Field from '#lib/components/ui/field/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { acknowledgeInspection } from '#lib/remote/inspections.remote.ts';
	import { KIND_LABEL } from '#lib/inspections.ts';
	import { formatDate } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';

	type Report = {
		id: string;
		kind: 'move_in' | 'move_out' | 'routine';
		completedAt: Date | null;
		acknowledgedAt: Date | null;
		tenantComment: string | null;
	};
	let { inspections, preview = false }: { inspections: Report[]; preview?: boolean } = $props();

	let comments = $state<Record<string, string>>({});
	let busy = $state<string | null>(null);
	const pdf = (id: string) => `/api/inspections/${id}/pdf`;

	async function acknowledge(e: SubmitEvent, id: string) {
		e.preventDefault();
		busy = id;
		try {
			await acknowledgeInspection({ id, comment: comments[id]?.trim() || null });
			toast.success('Thanks. Your review is saved with the report.');
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		} finally {
			busy = null;
		}
	}
</script>

{#each inspections.filter((i) => !i.acknowledgedAt) as i (i.id)}
	{@const what = KIND_LABEL[i.kind].toLowerCase()}
	<form
		class="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
		onsubmit={(e) => acknowledge(e, i.id)}
	>
		<div class="flex items-start gap-2">
			<ClipboardCheck class="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" />
			<div class="min-w-0 flex-1">
				<h2 class="text-sm font-medium">Review your {what} inspection</h2>
				<p class="text-xs text-muted-foreground">
					Check that the report matches the home. If something is wrong or missing, say so below and
					it will be saved with the report.
				</p>
			</div>
		</div>
		<Button href={pdf(i.id)} target="_blank" rel="noopener" variant="outline" size="sm"
			>Open report</Button
		>
		{#if preview}
			<p class="text-xs text-muted-foreground">Awaiting the tenant's review.</p>
		{:else}
			<Field.Field>
				<Field.Label for="ack-{i.id}">Anything that doesn’t match? (optional)</Field.Label>
				<Textarea
					id="ack-{i.id}"
					rows={3}
					maxlength={2000}
					placeholder="The bedroom carpet already had a stain by the closet."
					bind:value={() => comments[i.id] ?? '', (v) => (comments[i.id] = v)}
				/>
			</Field.Field>
			<Button type="submit" disabled={busy !== null}
				>{busy === i.id ? 'Saving…' : 'I’ve reviewed this report'}</Button
			>
		{/if}
	</form>
{/each}

{#if inspections.some((i) => i.acknowledgedAt)}
	<div>
		<h2 class="mb-2 text-sm font-medium">Inspection reports</h2>
		<ul class="divide-y rounded-lg border text-sm">
			{#each inspections.filter((i) => i.acknowledgedAt) as i (i.id)}
				<li class="flex items-center gap-3 px-3 py-2">
					<a
						href={pdf(i.id)}
						target="_blank"
						rel="noopener"
						class="min-w-0 flex-1 truncate hover:underline"
						>{KIND_LABEL[i.kind]} inspection · {formatDate(i.completedAt)}</a
					>
					<span class="text-xs text-muted-foreground"
						>Reviewed {formatDate(i.acknowledgedAt)}{i.tenantComment
							? ' · with comments'
							: ''}</span
					>
				</li>
			{/each}
		</ul>
	</div>
{/if}
