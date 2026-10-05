<script lang="ts">
	import AgreementBody from './agreement-body.svelte';
	import StatusBadge from './status-badge.svelte';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Checkbox } from '#lib/components/ui/checkbox/index.js';
	import { signAgreement } from '#lib/remote/agreements.remote.ts';
	import { formatDate } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import FileSignature from '@lucide/svelte/icons/file-signature';

	type Agreement = {
		id: string;
		title: string;
		status: string;
		body: string | null;
		contentHash: string;
		completedAt: Date | null;
		needsMySignature: boolean;
		signers: { name: string; signedAt: Date | null }[];
	};
	let { agreements }: { agreements: Agreement[] } = $props();

	let names = $state<Record<string, string>>({});
	let consent = $state<Record<string, boolean>>({});
	let signing = $state<string | null>(null);

	const pdf = (id: string) => `/api/agreements/${id}/pdf`;

	async function sign(e: SubmitEvent, a: Agreement) {
		e.preventDefault();
		if (!consent[a.id]) return toast.error('Agree to sign electronically first');
		signing = a.id;
		try {
			const { completed } = await signAgreement({
				id: a.id,
				signedName: names[a.id] ?? '',
				contentHash: a.contentHash
			});
			toast.success(
				completed
					? 'Signed. Everyone has signed, and the final PDF is ready.'
					: 'Signed. We’ll let you know when everyone has signed.'
			);
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not sign');
		} finally {
			signing = null;
		}
	}
</script>

{#each agreements.filter((a) => a.needsMySignature) as a (a.id)}
	<div class="space-y-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-4">
		<div class="flex items-start gap-2">
			<FileSignature class="mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-400" />
			<div class="min-w-0 flex-1">
				<h2 class="text-sm font-medium">Ready to sign: {a.title}</h2>
				<p class="text-xs text-muted-foreground">
					Read the whole document, then type your full name to sign.
					<a href={pdf(a.id)} target="_blank" rel="noopener" class="underline">Open as PDF</a>
				</p>
			</div>
		</div>
		{#if a.body}
			<!-- Scrollable document must be keyboard-focusable so it can be scrolled. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="max-h-96 overflow-y-auto rounded-md border bg-background p-4"
				tabindex="0"
				role="document"
				aria-label={a.title}
			>
				<AgreementBody body={a.body} />
			</div>
		{/if}
		<form class="space-y-3" onsubmit={(e) => sign(e, a)}>
			<Field.Field>
				<Field.Label for="sig-{a.id}">Your full name</Field.Label>
				<Input
					id="sig-{a.id}"
					required
					maxlength={200}
					autocomplete="name"
					class="font-serif text-lg italic"
					bind:value={() => names[a.id] ?? '', (v) => (names[a.id] = v)}
				/>
			</Field.Field>
			<Field.Field orientation="horizontal">
				<Checkbox
					id="consent-{a.id}"
					bind:checked={() => consent[a.id] ?? false, (v) => (consent[a.id] = v)}
				/>
				<Field.Label for="consent-{a.id}" class="text-sm leading-snug font-normal"
					>I agree to sign electronically, and that typing my name is my legal signature on this
					document.</Field.Label
				>
			</Field.Field>
			<Button type="submit" disabled={signing !== null}
				>{signing === a.id ? 'Signing…' : 'Sign lease'}</Button
			>
		</form>
	</div>
{/each}

{#if agreements.some((a) => !a.needsMySignature)}
	<div>
		<h2 class="mb-2 text-sm font-medium">Lease documents</h2>
		<ul class="divide-y rounded-lg border text-sm">
			{#each agreements.filter((a) => !a.needsMySignature) as a (a.id)}
				<li class="flex items-center gap-3 px-3 py-2">
					<a
						href={pdf(a.id)}
						target="_blank"
						rel="noopener"
						class="min-w-0 flex-1 truncate hover:underline">{a.title}</a
					>
					<span class="hidden text-xs text-muted-foreground sm:inline">
						{a.status === 'signed'
							? `Signed ${formatDate(a.completedAt)}`
							: `${a.signers.filter((s) => s.signedAt).length} of ${a.signers.length} signed`}
					</span>
					<StatusBadge status={a.status === 'sent' ? 'pending' : a.status} />
				</li>
			{/each}
		</ul>
	</div>
{/if}
