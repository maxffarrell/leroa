<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { getAuditLog } from '#lib/remote/audit.remote.ts';
	import { formatRelative } from '#lib/format.ts';
	import Download from '@lucide/svelte/icons/download';

	let entityType = $state('');
	let action = $state('');
	let actorId = $state('');
	let q = $state('');
	let from = $state('');
	let to = $state('');

	const filter = $derived({
		entityType: entityType || undefined,
		action: action || undefined,
		actorId: actorId || undefined,
		q: q || undefined,
		from: from || undefined,
		to: to || undefined
	});
	const audit = $derived(await getAuditLog(filter));

	// Older pages, appended under the live first page.
	let older = $state<Awaited<ReturnType<typeof getAuditLog>>['rows']>([]);
	let olderDone = $state(false);
	let loadingMore = $state(false);
	let lastFilter = '';

	$effect(() => {
		const f = JSON.stringify(filter);
		if (f !== lastFilter) {
			lastFilter = f;
			older = [];
			olderDone = false;
		}
	});

	async function loadMore() {
		const rows = audit.rows;
		const last = older.length ? older[older.length - 1] : rows[rows.length - 1];
		if (!last) return;
		loadingMore = true;
		try {
			const more = await getAuditLog({ ...filter, before: last.createdAt.toISOString() });
			older = [...older, ...more.rows];
			olderDone = !more.hasMore;
		} finally {
			loadingMore = false;
		}
	}

	const shown = $derived([...audit.rows, ...older]);
	const canExport = $derived(audit.canExport);

	function exportCsv() {
		const p = new SvelteURLSearchParams();
		for (const [k, v] of Object.entries(filter)) if (v) p.set(k, v);
		window.location.href = `/api/audit/csv?${p}`;
	}

	const actLabel = (a: string) => a.replaceAll('_', ' ');
</script>

<Card.Root>
	<Card.Header class="flex-row items-center justify-between gap-3 space-y-0">
		<div>
			<Card.Title>Audit log</Card.Title>
			<Card.Description>
				Every change recorded in this workspace — {audit.total.toLocaleString()} events.
			</Card.Description>
		</div>
		{#if canExport}
			<Button variant="outline" size="sm" onclick={exportCsv}>
				<Download class="size-4" /> Export CSV
			</Button>
		{:else}
			<Badge variant="outline" class="gap-1.5 text-muted-foreground">
				<Download class="size-3.5" /> Export is an enterprise feature
			</Badge>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="flex flex-wrap items-center gap-2">
			<NativeSelect.Root aria-label="Entity type" class="h-8 w-40" bind:value={entityType}>
				<NativeSelect.Option value="">All types</NativeSelect.Option>
				{#each audit.facets.entityTypes as t (t)}
					<NativeSelect.Option value={t}>{actLabel(t)}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
			<NativeSelect.Root aria-label="Action" class="h-8 w-40" bind:value={action}>
				<NativeSelect.Option value="">All actions</NativeSelect.Option>
				{#each audit.facets.actions as a (a)}
					<NativeSelect.Option value={a}>{actLabel(a)}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
			<NativeSelect.Root aria-label="Actor" class="h-8 w-40" bind:value={actorId}>
				<NativeSelect.Option value="">Anyone</NativeSelect.Option>
				{#each audit.facets.actors as a (a.id)}
					<NativeSelect.Option value={a.id}>{a.name}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
			<Input
				class="h-8 w-44"
				placeholder="Search…"
				aria-label="Search the audit log"
				value={q}
				onchange={(e) => (q = e.currentTarget.value)}
			/>
			<Input type="date" class="h-8 w-36" aria-label="From" bind:value={from} />
			<Input type="date" class="h-8 w-36" aria-label="To" bind:value={to} />
		</div>

		{#if shown.length === 0}
			<p class="py-8 text-center text-sm text-muted-foreground">Nothing matches.</p>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-36">When</Table.Head>
							<Table.Head class="w-40">Actor</Table.Head>
							<Table.Head class="w-32">Type</Table.Head>
							<Table.Head class="w-32">Action</Table.Head>
							<Table.Head>Summary</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each shown as row (row.id)}
							<Table.Row>
								<Table.Cell
									class="text-xs whitespace-nowrap text-muted-foreground"
									title={row.createdAt.toISOString()}>{formatRelative(row.createdAt)}</Table.Cell
								>
								<Table.Cell class="text-sm">{row.actorName ?? 'System'}</Table.Cell>
								<Table.Cell class="text-xs">{actLabel(row.entityType)}</Table.Cell>
								<Table.Cell
									><Badge variant="outline" class="font-normal">{actLabel(row.action)}</Badge
									></Table.Cell
								>
								<Table.Cell class="text-sm">{row.summary}</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
			{#if audit.hasMore && !olderDone}
				<div class="flex justify-center">
					<Button variant="outline" size="sm" onclick={loadMore} disabled={loadingMore}>
						{loadingMore ? 'Loading…' : 'Load older events'}
					</Button>
				</div>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
