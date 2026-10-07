<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Modal from '#lib/components/ui/modal/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { toast } from 'svelte-sonner';
	import { formatRelative } from '#lib/format.ts';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import {
		closeSurvey,
		createSurvey,
		getSurveyResponses,
		getSurveys
	} from '#lib/remote/residents.remote.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Star from '@lucide/svelte/icons/star';
	import { confirmDelete } from '#lib/components/ui/confirm-delete-dialog/index.js';

	const properties = $derived(await getProperties());
	const surveys = $derived(await getSurveys());

	let creating = $state(false);
	let fTitle = $state('');
	let fQuestion = $state('');
	let fProperty = $state('');

	let viewing = $state('');
	const responses = $derived(viewing ? await getSurveyResponses(viewing) : []);
	const viewingSurvey = $derived(surveys.find((s) => s.id === viewing));

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!fTitle.trim() || !fQuestion.trim()) return;
		try {
			await createSurvey({
				propertyId: fProperty || null,
				title: fTitle.trim(),
				question: fQuestion.trim()
			});
			toast.success('Survey opened — residents see it in their portal');
			creating = false;
			fTitle = fQuestion = '';
			fProperty = '';
		} catch {
			toast.error('Could not create survey');
		}
	}
</script>

<div class="mt-4 space-y-4">
	<div class="flex items-center gap-3">
		<Button size="sm" onclick={() => (creating = true)}><Plus /> New survey</Button>
	</div>
	<div class="space-y-2">
		{#each surveys as s (s.id)}
			<button
				type="button"
				onclick={() => (viewing = s.id)}
				class="w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 {s.status ===
				'closed'
					? 'opacity-60'
					: ''}"
			>
				<div class="flex flex-wrap items-center gap-2">
					<span class="truncate text-sm font-medium">{s.title}</span>
					<Badge variant="secondary">{s.propertyName ?? 'All properties'}</Badge>
					{#if s.status === 'closed'}<Badge variant="outline">Closed</Badge>{/if}
					<span class="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
						{#if s.avgRating !== null}
							<Star class="size-3.5 fill-amber-400 text-amber-400" /><span class="tabular-nums"
								>{s.avgRating.toFixed(1)}</span
							>
						{/if}
						{s.responses} response{s.responses === 1 ? '' : 's'} · {formatRelative(s.createdAt)}
					</span>
				</div>
				<p class="mt-0.5 truncate text-xs text-muted-foreground">{s.question}</p>
			</button>
		{:else}
			<div class="rounded-lg border py-10 text-center text-sm text-muted-foreground">
				No surveys yet. Open one and residents answer it in their portal.
			</div>
		{/each}
	</div>
</div>

<Modal.Root bind:open={creating}>
	<Modal.Content class="sm:max-w-md">
		<form class="space-y-4" onsubmit={save}>
			<Modal.Header>
				<Modal.Title>New pulse survey</Modal.Title>
				<Modal.Description
					>One question, a 1–5 rating and an optional comment — answered in the resident portal.</Modal.Description
				>
			</Modal.Header>
			<Field.Field>
				<Field.Label>Title</Field.Label>
				<Input bind:value={fTitle} placeholder="July resident pulse" />
			</Field.Field>
			<Field.Field>
				<Field.Label>Question</Field.Label>
				<Input
					bind:value={fQuestion}
					placeholder="How would you rate maintenance response this month?"
				/>
			</Field.Field>
			<Field.Field>
				<Field.Label>Scope</Field.Label>
				<NativeSelect.Root bind:value={fProperty} class="w-full">
					<NativeSelect.Option value="">All properties</NativeSelect.Option>
					{#each properties as p (p.id)}
						<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>
					{/each}
				</NativeSelect.Root>
			</Field.Field>
			<Modal.Footer>
				<Button type="button" variant="outline" onclick={() => (creating = false)}>Cancel</Button>
				<Button type="submit" disabled={!fTitle.trim() || !fQuestion.trim()}>Open survey</Button>
			</Modal.Footer>
		</form>
	</Modal.Content>
</Modal.Root>

<Modal.Root open={viewing !== ''} onOpenChange={(o) => !o && (viewing = '')}>
	<Modal.Content class="sm:max-w-lg">
		<Modal.Header>
			<Modal.Title>{viewingSurvey?.title}</Modal.Title>
			<Modal.Description
				>{viewingSurvey?.question} · {viewingSurvey?.propertyName ??
					'All properties'}</Modal.Description
			>
		</Modal.Header>
		<div class="max-h-80 space-y-2 overflow-y-auto">
			{#each responses as r (r.id)}
				<div class="rounded-md border p-3 text-sm">
					<div class="flex items-center gap-2">
						<span class="font-medium"
							>{`${r.tenantFirst ?? ''} ${r.tenantLast ?? ''}`.trim() || r.tenantCompany}</span
						>
						{#if r.rating}
							<span class="flex items-center gap-0.5 text-xs text-muted-foreground">
								{#each { length: 5 } as _, i (i)}
									<Star
										class="size-3.5 {i < r.rating
											? 'fill-amber-400 text-amber-400'
											: 'text-muted-foreground/40'}"
									/>
								{/each}
							</span>
						{/if}
						<span class="ml-auto text-xs text-muted-foreground">{formatRelative(r.createdAt)}</span>
					</div>
					{#if r.comment}
						<p class="mt-1 text-muted-foreground">{r.comment}</p>
					{/if}
				</div>
			{:else}
				<p class="py-6 text-center text-sm text-muted-foreground">No responses yet.</p>
			{/each}
		</div>
		<Modal.Footer>
			{#if viewingSurvey?.status === 'open'}
				<Button
					variant="outline"
					onclick={() =>
						confirmDelete({
							title: `Close ${viewingSurvey.title}?`,
							description: 'Residents can no longer answer it.',
							onConfirm: async () => {
								await closeSurvey(viewing).catch(() => toast.error('Could not close'));
								viewing = '';
							}
						})}>Close survey</Button
				>
			{/if}
			<Button variant="outline" onclick={() => (viewing = '')}>Done</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
