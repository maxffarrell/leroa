<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { page } from '$app/state';
	import { importCsv } from '#lib/remote/reports.remote.ts';
	import { aiMapCsv } from '#lib/remote/ai.remote.ts';
	import { parseCsv } from '#lib/csv.ts';
	import {
		IMPORT_KINDS,
		IMPORT_TYPES,
		autoMap,
		templateCsv,
		type ImportKind
	} from '#lib/import.ts';
	import Download from '@lucide/svelte/icons/download';
	import FileUp from '@lucide/svelte/icons/file-up';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { Label } from '#lib/components/ui/label/index.js';

	type Result = Awaited<ReturnType<typeof importCsv>>;
	const MAX_BYTES = 2_000_000;

	let kind = $state<ImportKind>('leases');
	let fileName = $state('');
	let csv = $state('');
	let headers = $state<string[]>([]);
	let sample = $state<string[]>([]);
	let rowCount = $state(0);
	let mapping = $state<Record<string, number | null>>({});
	let preview = $state<Result | null>(null);
	let done = $state<Result | null>(null);
	let pending = $state(false);
	let problemsOnly = $state(false);
	let aiMapped = $state<string[]>([]);
	let mappingGen = 0;

	/** Fills columns the alias table missed; autoMap stays authoritative. */
	async function aiFill() {
		if (!page.data.enterprise || !headers.length) return;
		const gen = ++mappingGen;
		const unmapped = spec.fields.filter((f) => mapping[f.key] == null).map((f) => f.key);
		if (!unmapped.length) return;
		try {
			const guess = await aiMapCsv({
				headers,
				fields: spec.fields.map(({ key, label }) => ({ key, label })),
				unmapped
			});
			if (gen !== mappingGen) return;
			const filled: string[] = [];
			for (const [k, i] of Object.entries(guess)) {
				if (i != null && mapping[k] == null) {
					mapping[k] = i;
					filled.push(spec.fields.find((f) => f.key === k)?.label ?? k);
				}
			}
			if (filled.length) {
				aiMapped = filled;
				toast.success(`AI mapped: ${filled.join(', ')}`);
			}
		} catch {
			/* AI unavailable or 403 — keep manual mapping */
		}
	}

	const spec = $derived(IMPORT_TYPES[kind]);
	const missing = $derived(
		spec.fields.filter((f) => f.required && mapping[f.key] == null).map((f) => f.label)
	);
	const needsName = $derived(
		kind !== 'units' &&
			!['name', 'firstName', 'lastName', 'company'].some((k) => mapping[k] != null)
	);
	const shown = $derived(
		(preview?.rows ?? []).filter((r) => !problemsOnly || r.status === 'error').slice(0, 300)
	);

	function reset() {
		preview = null;
		done = null;
	}

	function chooseKind(k: ImportKind) {
		kind = k;
		mapping = headers.length ? autoMap(headers, k) : {};
		aiMapped = [];
		reset();
		void aiFill();
	}

	async function onfile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!file) return;
		if (file.size > MAX_BYTES)
			return toast.error('That file is over 2 MB. Split it and import in parts.');
		const text = await file.text();
		const table = parseCsv(text);
		if (table.length < 2) return toast.error('That file has no data rows under the header.');
		fileName = file.name;
		csv = text;
		headers = table[0]!.map((h) => h.trim());
		sample = table[1]!;
		rowCount = table.length - 1;
		mapping = autoMap(headers, kind);
		aiMapped = [];
		reset();
		void aiFill();
	}

	function downloadTemplate() {
		const url = URL.createObjectURL(new Blob([templateCsv(kind)], { type: 'text/csv' }));
		const a = Object.assign(document.createElement('a'), {
			href: url,
			download: `leroa-${kind}-template.csv`
		});
		a.click();
		URL.revokeObjectURL(url);
	}

	async function run(dryRun: boolean) {
		pending = true;
		try {
			const result = await importCsv({ kind, csv, mapping: $state.snapshot(mapping), dryRun });
			if (dryRun) {
				preview = result;
				problemsOnly = result.counts.error > 0;
			} else {
				done = result;
				preview = null;
				toast.success(
					`Imported: ${result.counts.create} added${result.counts.update ? `, ${result.counts.update} updated` : ''}`
				);
			}
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Import failed');
		} finally {
			pending = false;
		}
	}

	const tone = {
		create: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
		update: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
		skip: 'bg-muted text-muted-foreground',
		error: 'bg-destructive/10 text-destructive'
	} as const;
	const statusLabel = { create: 'Add', update: 'Update', skip: 'Skip', error: 'Problem' } as const;
	const landing = { units: '/properties', tenants: '/tenants', leases: '/leases' } as const;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Import from CSV</Card.Title>
		<Card.Description
			>Bring in records from a spreadsheet or another system’s export. Nothing is saved until you
			review the check and confirm.</Card.Description
		>
	</Card.Header>
	<Card.Content class="space-y-5">
		<div class="space-y-2">
			<p class="text-sm font-medium">1. What are you importing?</p>
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				class="flex-wrap"
				value={kind}
				onValueChange={(v) => v && chooseKind(v as ImportKind)}
			>
				{#each IMPORT_KINDS as k (k)}
					<ToggleGroup.Item value={k}>{IMPORT_TYPES[k].title}</ToggleGroup.Item>
				{/each}
			</ToggleGroup.Root>
			<p class="text-sm text-muted-foreground">{spec.description}</p>
			{#if kind === 'leases'}
				<p class="text-sm text-muted-foreground">
					Leases that ended before today are added as past leases. Deposits are recorded on the
					lease but not charged again. Leroa posts this month’s rent itself, so “Balance owed today”
					should only cover earlier months.
				</p>
			{/if}
			<Button size="sm" variant="link" class="h-auto px-0" onclick={downloadTemplate}
				><Download /> Download a template</Button
			>
		</div>

		<div class="space-y-2">
			<p class="text-sm font-medium">2. Choose the file</p>
			<label
				class="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm focus-within:ring-2 focus-within:ring-ring hover:bg-muted/50"
			>
				<FileUp class="size-5 text-muted-foreground" />
				<span class="min-w-0 flex-1 truncate"
					>{#if fileName}<span class="font-medium">{fileName}</span>
						<span class="text-muted-foreground">· {rowCount.toLocaleString('en-US')} rows</span
						>{:else}<span class="text-muted-foreground">CSV file, up to 2 MB and 2,000 rows</span
						>{/if}</span
				>
				<span class="font-medium">{fileName ? 'Replace' : 'Browse'}</span>
				<input type="file" accept=".csv,text/csv" class="sr-only" onchange={onfile} />
			</label>
		</div>

		{#if headers.length}
			<div class="space-y-2">
				<p class="text-sm font-medium">
					3. Match the columns
					{#if aiMapped.length}<span class="font-normal text-muted-foreground"
							>— AI filled {aiMapped.length} for you</span
						>{/if}
				</p>
				<div class="overflow-x-auto rounded-lg border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Leroa field</Table.Head>
								<Table.Head>Column in your file</Table.Head>
								<Table.Head class="hidden sm:table-cell">First row</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each spec.fields as f (f.key)}
								<Table.Row>
									<Table.Cell class="font-medium whitespace-nowrap"
										>{f.label}{#if f.required}<span class="text-destructive" aria-label="required">
												*</span
											>{/if}</Table.Cell
									>
									<Table.Cell>
										<NativeSelect.Root
											aria-label="Column for {f.label}"
											class="h-8 w-full min-w-36 sm:w-56"
											value={mapping[f.key] == null ? '' : String(mapping[f.key])}
											onchange={(e) => {
												const v = e.currentTarget.value;
												mapping[f.key] = v === '' ? null : Number(v);
												reset();
											}}
										>
											<NativeSelect.Option value="">— Not in file —</NativeSelect.Option>
											{#each headers as h, i (i)}
												<NativeSelect.Option value={String(i)}
													>{h || `Column ${i + 1}`}</NativeSelect.Option
												>
											{/each}
										</NativeSelect.Root>
									</Table.Cell>
									<Table.Cell class="hidden max-w-48 truncate text-muted-foreground sm:table-cell"
										>{mapping[f.key] == null ? '' : (sample[mapping[f.key]!] ?? '')}</Table.Cell
									>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
				{#if missing.length || needsName}
					<p class="text-sm text-destructive">
						Choose a column for {[...missing, ...(needsName ? ['a name'] : [])].join(', ')}.
					</p>
				{/if}
				<div class="flex flex-wrap items-center gap-2">
					<Button
						variant={preview ? 'outline' : 'default'}
						disabled={pending || missing.length > 0 || needsName}
						onclick={() => run(true)}>{pending && !preview ? 'Checking…' : 'Check file'}</Button
					>
				</div>
			</div>
		{/if}

		{#if preview}
			<div class="space-y-3">
				<p class="text-sm font-medium">4. Review and import</p>
				<div class="flex flex-wrap gap-2 text-sm">
					{#each ['create', 'update', 'skip', 'error'] as const as s (s)}
						{#if preview.counts[s]}
							<span class="rounded-md px-2 py-0.5 {tone[s]}"
								>{preview.counts[s]} {statusLabel[s].toLowerCase()}{s === 'error' ? 's' : ''}</span
							>
						{/if}
					{/each}
				</div>
				{#if preview.counts.error}
					<span class="flex items-center gap-2 text-sm text-muted-foreground">
						<Checkbox id="import-problems-only" bind:checked={problemsOnly} />
						<Label for="import-problems-only" class="font-normal">Show problems only</Label>
					</span>
				{/if}
				<div class="max-h-96 overflow-auto rounded-lg border">
					<Table.Root>
						<Table.Body>
							{#each shown as r (r.line)}
								<Table.Row>
									<Table.Cell class="w-16 text-muted-foreground tabular-nums"
										>Row {r.line}</Table.Cell
									>
									<Table.Cell class="w-20"
										><Badge variant="outline" class="border-0 {tone[r.status]}"
											>{statusLabel[r.status]}</Badge
										></Table.Cell
									>
									<Table.Cell class="whitespace-normal">{r.message}</Table.Cell>
								</Table.Row>
							{:else}
								<Table.Row
									><Table.Cell class="py-6 text-center text-muted-foreground"
										>No problems.</Table.Cell
									></Table.Row
								>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
				{#if preview.rows.length > shown.length && !problemsOnly}
					<p class="text-xs text-muted-foreground">Showing the first {shown.length} rows.</p>
				{/if}
				<div class="flex flex-wrap items-center gap-3">
					<Button
						disabled={pending || preview.counts.create + preview.counts.update === 0}
						onclick={() => run(false)}
						>{pending
							? 'Importing…'
							: `Import ${(preview.counts.create + preview.counts.update).toLocaleString('en-US')} rows`}</Button
					>
					{#if preview.counts.error}
						<p class="text-sm text-muted-foreground">
							Rows with problems are skipped. Fix them in the file and import it again; rows already
							imported are skipped the second time.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		{#if done}
			<div class="rounded-lg border bg-muted/40 p-4 text-sm" role="status">
				<p class="font-medium">
					Import finished: {done.counts.create} added{done.counts.update
						? `, ${done.counts.update} updated`
						: ''}{done.counts.skip ? `, ${done.counts.skip} skipped` : ''}{done.counts.error
						? `, ${done.counts.error} with problems`
						: ''}.
				</p>
				<a href={landing[kind]} class="mt-1 inline-block underline-offset-4 hover:underline"
					>Open {IMPORT_TYPES[kind].title.toLowerCase()} →</a
				>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
