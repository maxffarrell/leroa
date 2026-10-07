<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { toast } from 'svelte-sonner';
	import { respondSurvey } from '#lib/remote/portal.remote.ts';
	import Star from '@lucide/svelte/icons/star';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';

	let {
		surveys
	}: {
		surveys: {
			id: string;
			title: string;
			question: string;
			propertyName: string | null;
			answered: boolean;
		}[];
	} = $props();

	let rating = $state<Record<string, number>>({});
	let comment = $state<Record<string, string>>({});
	let done = $state<Record<string, boolean>>({});
	let sending = $state<string | null>(null);

	async function answer(id: string) {
		sending = id;
		try {
			await respondSurvey({
				surveyId: id,
				rating: rating[id] ?? null,
				comment: comment[id]?.trim() || null
			});
			done = { ...done, [id]: true };
			toast.success('Thanks for the feedback!');
		} catch {
			toast.error('Could not save your answer');
		} finally {
			sending = null;
		}
	}
</script>

{#each surveys as s (s.id)}
	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-center gap-2">
				<Card.Title class="text-base">{s.title}</Card.Title>
				{#if s.propertyName}<Badge variant="secondary">{s.propertyName}</Badge>{/if}
			</div>
			<Card.Description>{s.question}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if s.answered || done[s.id]}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<CheckCircle2 class="size-4 text-emerald-600" /> Answered — thank you!
				</p>
			{:else}
				<div class="flex items-center gap-1">
					{#each { length: 5 } as _, i (i)}
						<button
							type="button"
							aria-label="{i + 1} star{i ? 's' : ''}"
							class="p-0.5"
							onclick={() => (rating = { ...rating, [s.id]: i + 1 })}
						>
							<Star
								class="size-6 transition {i < (rating[s.id] ?? 0)
									? 'fill-amber-400 text-amber-400'
									: 'text-muted-foreground/40 hover:text-muted-foreground'}"
							/>
						</button>
					{/each}
				</div>
				<Textarea
					class="mt-3"
					rows={2}
					placeholder="Anything to add? (optional)"
					value={comment[s.id] ?? ''}
					oninput={(e) => (comment = { ...comment, [s.id]: e.currentTarget.value })}
				/>
				<div class="mt-3">
					<Button
						size="sm"
						disabled={sending === s.id || !(rating[s.id] ?? 0)}
						onclick={() => answer(s.id)}>{sending === s.id ? 'Sending…' : 'Send answer'}</Button
					>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
{/each}
