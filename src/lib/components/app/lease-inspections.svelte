<script lang="ts">
	import StatusBadge from './status-badge.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { createInspection, getInspections } from '#lib/remote/inspections.remote.ts';
	import { KIND_LABEL, type InspectionKind } from '#lib/inspections.ts';
	import { formatDate, todayISO } from '#lib/format.ts';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';

	let { leaseId, unitId, status }: { leaseId: string; unitId: string; status: string } = $props();

	const list = $derived(await getInspections({ leaseId }));
	const has = (k: InspectionKind) => list.some((i) => i.kind === k);
	let busy = $state(false);

	async function start(kind: InspectionKind) {
		busy = true;
		try {
			const i = await createInspection({ unitId, leaseId, kind, scheduledFor: todayISO() });
			await goto(`/inspections/${i.id}`);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not start');
		} finally {
			busy = false;
		}
	}
</script>

<section class="space-y-2">
	<div class="flex flex-wrap items-center gap-2">
		<h2 class="text-sm font-medium">Inspections</h2>
		<div class="ml-auto flex gap-2">
			{#if !has('move_in') && status !== 'ended' && status !== 'terminated'}
				<Button size="sm" variant="outline" disabled={busy} onclick={() => start('move_in')}
					><ClipboardCheck /> Move-in</Button
				>
			{/if}
			{#if !has('move_out') && status !== 'draft'}
				<Button size="sm" variant="outline" disabled={busy} onclick={() => start('move_out')}
					><ClipboardCheck /> Move-out</Button
				>
			{/if}
		</div>
	</div>
	{#if list.length}
		<ul class="divide-y rounded-lg border text-sm">
			{#each list as i (i.id)}
				<li>
					<a href="/inspections/{i.id}" class="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
						<span class="min-w-0 flex-1 truncate font-medium">{KIND_LABEL[i.kind]}</span>
						<span class="hidden text-xs text-muted-foreground sm:inline">
							{i.status === 'completed'
								? `${formatDate(i.completedAt)}${i.flagged ? ` · ${i.flagged} need attention` : ''}${i.kind !== 'routine' ? (i.acknowledgedAt ? ' · reviewed by resident' : ' · awaiting resident') : ''}`
								: `${i.rated} of ${i.total} rated`}
						</span>
						<StatusBadge status={i.status} />
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-xs text-muted-foreground">
			No inspections on this lease yet. A move-in report protects you and the resident at move-out.
		</p>
	{/if}
</section>
