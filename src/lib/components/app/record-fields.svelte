<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { getRecordFields, writeFieldValue } from '#lib/remote/fields.remote.ts';
	import type { FieldEntity } from '#lib/schemas.ts';

	let { entity, recordId }: { entity: FieldEntity; recordId: string } = $props();

	const fields = $derived(await getRecordFields({ entity, recordId }));

	// Local draft so typing doesn't fire a command per keystroke; saved on blur/Enter.
	let draft = $derived<Record<string, string>>(
		Object.fromEntries(fields.map((f) => [f.id, f.value ?? '']))
	);

	async function save(f: (typeof fields)[number], value: string | null) {
		if ((f.value ?? '') === (value ?? '')) return;
		try {
			await writeFieldValue({ entity, fieldId: f.id, recordId, value });
		} catch {
			toast.error(`Couldn't save ${f.name}`);
		}
	}
</script>

{#if fields.length || page.data.role !== 'member'}
	<section class="space-y-2" data-tour="custom-fields">
		<h3 class="text-xs font-medium tracking-wide text-muted-foreground uppercase">Custom fields</h3>
		{#if !fields.length}
			<p class="text-sm text-muted-foreground">
				None yet — admins can add them in
				<a href="/settings/fields" class="underline underline-offset-2">Settings → Fields</a>.
			</p>
		{:else}
			<div class="grid gap-2 sm:grid-cols-2">
				{#each fields as f (f.id)}
					<label class="flex flex-col gap-1 text-sm">
						<span class="text-xs text-muted-foreground">{f.name}</span>
						{#if f.type === 'select'}
							<NativeSelect.Root
								class="h-8"
								value={draft[f.id] ?? ''}
								onchange={(e) => save(f, e.currentTarget.value || null)}
							>
								<NativeSelect.Option value="">—</NativeSelect.Option>
								{#each f.options ?? [] as o (o)}
									<NativeSelect.Option value={o}>{o}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						{:else if f.type === 'checkbox'}
							<span class="flex h-8 items-center">
								<input
									type="checkbox"
									class="accent-primary"
									checked={draft[f.id] === 'true'}
									onchange={(e) => {
										const v = e.currentTarget.checked ? 'true' : null;
										draft[f.id] = v ?? '';
										save(f, v);
									}}
								/>
							</span>
						{:else}
							<Input
								class="h-8"
								type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
								bind:value={draft[f.id]}
								onblur={() => save(f, draft[f.id]?.trim() || null)}
								onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
							/>
						{/if}
					</label>
				{/each}
			</div>
		{/if}
	</section>
{/if}
