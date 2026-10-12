<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageHeader from '#lib/components/app/page-header.svelte';
	import { openHref } from '#lib/components/app/row-nav.svelte.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { BarChart } from 'layerchart';
	import { getReport } from '#lib/remote/reports.remote.ts';
	import { aiReportSummary } from '#lib/remote/ai.remote.ts';
	import AiSummary from '#lib/components/app/ai-summary.svelte';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import {
		REPORTS,
		matchesQuery,
		reportQuery,
		withSearch,
		type ReportColumn,
		type ReportParams,
		type ReportValue
	} from '#lib/reports.ts';
	import { formatDate, formatMoney, todayISO } from '#lib/format.ts';
	import Download from '@lucide/svelte/icons/download';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';

	let { data } = $props();
	const key = $derived(data.key);
	const meta = $derived(REPORTS[key]);

	const sp = $derived(page.url.searchParams);
	const int = (s: string | null) => (s && /^\d+$/.test(s) ? Number(s) : undefined);
	const params = $derived<ReportParams>({
		propertyId: sp.get('propertyId') || undefined,
		days: meta.param === 'days' ? (int(sp.get('days')) ?? 90) : undefined,
		months: meta.param === 'months' ? (int(sp.get('months')) ?? 12) : undefined,
		from: meta.param === 'range' ? sp.get('from') || `${todayISO().slice(0, 4)}-01-01` : undefined,
		to: meta.param === 'range' ? sp.get('to') || todayISO() : undefined
	});
	const urlSearch = () => untrack(() => page.url.searchParams.get('q') ?? '');
	let search = $state(urlSearch());
	const query = $derived(withSearch(reportQuery(params), search));

	const properties = $derived(await getProperties());
	const report = $derived(await getReport({ key, ...params }));

	function set(patch: Partial<ReportParams>) {
		const q = withSearch(reportQuery({ ...params, ...patch }), search);
		void goto(`?${q}`, { replace: true, reset: false });
	}

	let sort = $state<{ key: string; dir: 1 | -1 } | null>(null);
	$effect(() => {
		void key;
		sort = null;
		search = urlSearch();
	});
	$effect(() => {
		if (search.trim() === urlSearch()) return;
		const t = setTimeout(() => set({}), 300);
		return () => clearTimeout(t);
	});

	const indexed = $derived(
		report.rows.map((row, i) => ({ row, link: report.links[i] ?? null, i }))
	);
	const rows = $derived.by(() => {
		const list = search.trim() ? indexed.filter(({ row }) => matchesQuery(row, search)) : indexed;
		if (!sort) return list;
		const { key: k, dir } = sort;
		return [...list].sort((a, b) => {
			const x = a.row[k] ?? null;
			const y = b.row[k] ?? null;
			if (x === y) return a.i - b.i;
			if (x === null) return 1;
			if (y === null) return -1;
			return (
				(typeof x === 'number' && typeof y === 'number'
					? x - y
					: String(x).localeCompare(String(y), undefined, { numeric: true })) * dir
			);
		});
	});

	/** First click sorts text A→Z and numbers high→low, second click reverses, third clears. */
	function toggleSort(c: ReportColumn) {
		const first: 1 | -1 = numeric(c) || c.type === 'date' ? -1 : 1;
		if (sort?.key !== c.key) sort = { key: c.key, dir: first };
		else if (sort.dir === first) sort = { key: c.key, dir: first === 1 ? -1 : 1 };
		else sort = null;
	}

	const numeric = (c: ReportColumn) =>
		c.type === 'money' || c.type === 'number' || c.type === 'percent';

	function show(c: ReportColumn, v: ReportValue | undefined) {
		if (v == null || v === '') return '—';
		if (typeof v === 'number') {
			if (c.type === 'money')
				return report.currency ? formatMoney(v, report.currency) : (v / 100).toFixed(2);
			if (c.type === 'percent') return `${v}%`;
			return v.toLocaleString('en-US');
		}
		return c.type === 'date' ? formatDate(v) : v;
	}
	const cls = (c: ReportColumn) =>
		[numeric(c) ? 'text-right tabular-nums' : '', c.secondary ? 'hidden sm:table-cell' : '']
			.filter(Boolean)
			.join(' ');

	const collectionsConfig = {
		due: { label: 'Rent due', color: 'var(--chart-2)' },
		collected: { label: 'Collected', color: 'var(--chart-4)' }
	} satisfies Chart.ChartConfig;
	const collectionsData = $derived(
		key === 'collections'
			? report.rows.map((r) => ({ month: r.month, due: r.due, collected: r.collected }))
			: []
	);
	const occupancyConfig = {
		occupied: { label: 'Occupied', color: 'var(--chart-4)' },
		vacant: { label: 'Vacant', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;
	const occupancyData = $derived(
		key === 'occupancy'
			? report.rows.map((r) => ({
					property: String(r.property ?? ''),
					occupied: Number(r.occupied ?? 0),
					vacant: Number(r.vacant ?? 0)
				}))
			: []
	);
</script>

<PageHeader title={meta.title} crumbs={[{ label: 'Reports', href: '/reports' }]}>
	{#snippet actions()}
		<Button size="sm" variant="outline" href="/api/reports/{key}/csv?{query}" download
			><Download /> <span class="hidden sm:inline">Export CSV</span><span class="sm:hidden"
				>CSV</span
			></Button
		>
	{/snippet}
</PageHeader>

<main class="space-y-4 p-4 md:p-6">
	<div>
		<p class="text-sm text-muted-foreground">{meta.description}</p>
		<p class="mt-1 text-xs text-muted-foreground">{report.subtitle}</p>
	</div>

	{#if page.data.ai}
		<AiSummary
			load={() => aiReportSummary({ key, ...params })}
			description="An AI read of this report — what stands out and what to check first."
		/>
	{/if}

	{#if key === 'collections' && collectionsData.some((r) => r.due || r.collected)}
		<Card.Root>
			<Card.Content class="px-2 pt-4 sm:px-6">
				<Chart.Container config={collectionsConfig} class="h-56 w-full">
					<BarChart
						data={collectionsData}
						x="month"
						axis="x"
						series={[
							{
								key: 'due',
								label: collectionsConfig.due.label,
								color: collectionsConfig.due.color
							},
							{
								key: 'collected',
								label: collectionsConfig.collected.label,
								color: collectionsConfig.collected.color
							}
						]}
						seriesLayout="group"
						rule={{ y: true }}
						legend
					>
						{#snippet tooltip()}
							<Chart.Tooltip>
								{#snippet formatter({ value, name })}
									<div class="flex w-full items-center justify-between gap-2">
										<span class="text-muted-foreground">{name}</span>
										<span class="font-mono font-medium text-foreground tabular-nums">
											{report.currency
												? formatMoney(Number(value), report.currency)
												: (Number(value) / 100).toFixed(2)}
										</span>
									</div>
								{/snippet}
							</Chart.Tooltip>
						{/snippet}
					</BarChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if key === 'occupancy' && occupancyData.some((r) => r.occupied || r.vacant)}
		<Card.Root>
			<Card.Content class="px-2 pt-4 sm:px-6">
				<Chart.Container config={occupancyConfig} class="h-56 w-full">
					<BarChart
						data={occupancyData}
						x="property"
						axis="x"
						series={[
							{
								key: 'occupied',
								label: occupancyConfig.occupied.label,
								color: occupancyConfig.occupied.color
							},
							{
								key: 'vacant',
								label: occupancyConfig.vacant.label,
								color: occupancyConfig.vacant.color
							}
						]}
						seriesLayout="stack"
						rule={{ y: true }}
						legend
					>
						{#snippet tooltip()}
							<Chart.Tooltip />
						{/snippet}
					</BarChart>
				</Chart.Container>
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="flex flex-wrap items-center gap-3">
		<NativeSelect.Root
			aria-label="Property"
			class="h-8 max-w-56"
			value={params.propertyId ?? ''}
			onchange={(e) => set({ propertyId: e.currentTarget.value || undefined })}
		>
			<NativeSelect.Option value="">All properties</NativeSelect.Option>
			{#each properties as p (p.id)}
				<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>
			{/each}
		</NativeSelect.Root>

		{#if meta.param === 'days'}
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				aria-label="Ending within"
				value={String(params.days)}
				onValueChange={(v) => v && set({ days: Number(v) })}
			>
				{#each [30, 60, 90, 180] as d (d)}
					<ToggleGroup.Item value={String(d)}>{d} days</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		{:else if meta.param === 'months'}
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				aria-label="Months"
				value={String(params.months)}
				onValueChange={(v) => v && set({ months: Number(v) })}
			>
				{#each [6, 12, 24] as m (m)}
					<ToggleGroup.Item value={String(m)}>{m} months</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
		{:else if meta.param === 'range'}
			<div class="flex items-center gap-2 text-sm">
				<Input
					type="date"
					aria-label="From"
					class="h-8 w-38"
					value={params.from}
					onchange={(e) => e.currentTarget.value && set({ from: e.currentTarget.value })}
				/>
				<span class="text-muted-foreground">to</span>
				<Input
					type="date"
					aria-label="To"
					class="h-8 w-38"
					value={params.to}
					onchange={(e) => e.currentTarget.value && set({ to: e.currentTarget.value })}
				/>
			</div>
		{/if}

		<Input placeholder="Filter rows…" class="h-8 max-w-48" bind:value={search} />
	</div>

	<div class="overflow-x-auto rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					{#each report.columns as c (c.key)}
						<Table.Head
							class={cls(c)}
							aria-sort={sort?.key === c.key
								? sort.dir === 1
									? 'ascending'
									: 'descending'
								: undefined}
						>
							<button
								type="button"
								class="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground"
								onclick={() => toggleSort(c)}
								>{c.label}{#if sort?.key === c.key}{#if sort.dir === 1}<ArrowUp
											class="size-3"
										/>{:else}<ArrowDown class="size-3" />{/if}{/if}</button
							>
						</Table.Head>
					{/each}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as { row, link, i } (i)}
					<Table.Row
						class={link ? 'cursor-pointer' : ''}
						onclick={(e) => {
							if (link && !(e.target as HTMLElement).closest('a')) openHref(link);
						}}
					>
						{#each report.columns as c, ci (c.key)}
							<Table.Cell class="{cls(c)} {ci === 0 ? 'font-medium' : ''} max-w-64 truncate">
								{#if ci === 0 && link}<a href={link} class="hover:underline"
										>{show(c, row[c.key])}</a
									>{:else}{show(c, row[c.key])}{/if}
							</Table.Cell>
						{/each}
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell
							colspan={report.columns.length}
							class="py-10 text-center text-muted-foreground"
							>{report.rows.length
								? 'No rows match the filter.'
								: 'Nothing to report yet.'}</Table.Cell
						>
					</Table.Row>
				{/each}
			</Table.Body>
			{#if report.totals && !search.trim()}
				<Table.Footer>
					<Table.Row>
						{#each report.columns as c, ci (c.key)}
							<Table.Cell class="{cls(c)} font-medium whitespace-nowrap"
								>{ci === 0
									? report.totals[c.key]
									: report.totals[c.key] == null
										? ''
										: show(c, report.totals[c.key])}</Table.Cell
							>
						{/each}
					</Table.Row>
				</Table.Footer>
			{/if}
		</Table.Root>
	</div>
	{#if report.note}<p class="text-xs text-muted-foreground">{report.note}</p>{/if}
	{#if report.currency === null}<p class="text-xs text-muted-foreground">
			Amounts are in more than one currency, so money totals are left out.
		</p>{/if}
</main>
