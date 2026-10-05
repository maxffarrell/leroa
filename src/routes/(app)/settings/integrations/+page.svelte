<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { getIntegrations, saveIntegration } from '#lib/remote/workspace.remote.ts';
	import { toast } from 'svelte-sonner';
	import Puzzle from '@lucide/svelte/icons/puzzle';

	type Integration = Awaited<ReturnType<typeof getIntegrations>>[number];
	const list = $derived(await getIntegrations());
	const canManage = $derived(page.data.role !== 'member');
	let editing = $state<Integration | null>(null);
	let values = $state<Record<string, string | boolean>>({});
	let enabled = $state(true);

	function open(i: Integration) {
		editing = i;
		enabled = i.installed ? i.enabled : true;
		values = { ...i.values };
		for (const f of i.config) {
			if (f.type === 'boolean' && values[f.key] === '') values[f.key] = f.default ?? false;
		}
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		try {
			await saveIntegration({ id: editing.id, enabled, config: values });
			toast.success(`${editing.name} saved`);
			editing = null;
		} catch (err) {
			toast.error((err as { body?: { message?: string } })?.body?.message ?? 'Could not save');
		}
	}
</script>

<div class="flex items-start justify-between gap-4">
	<p class="text-sm text-muted-foreground">
		Integrations are open source. Build one with <code>@leroa/integration-sdk</code> and open a pull request
		to the integrations repo; once reviewed, it's available to every workspace.
	</p>
</div>

<div class="grid gap-4 sm:grid-cols-2">
	{#each list as i (i.id)}
		<Card.Root>
			<Card.Header class="flex-row items-start gap-3">
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background [&_svg]:size-5"
				>
					{#if i.icon?.startsWith('<svg')}<img
							alt=""
							class="size-5 dark:invert"
							src="data:image/svg+xml,{encodeURIComponent(i.icon)}"
						/>{:else}<Puzzle />{/if}
				</span>
				<div class="min-w-0 flex-1 space-y-1">
					<Card.Title class="flex items-center gap-2"
						>{i.name}
						{#if i.installed && i.enabled}<Badge variant="secondary">On</Badge>{/if}</Card.Title
					>
					<Card.Description>{i.description}</Card.Description>
				</div>
			</Card.Header>
			<Card.Footer class="justify-between text-xs text-muted-foreground">
				<span>by {i.author.name}</span>
				<Button
					size="sm"
					variant={i.installed ? 'outline' : 'default'}
					disabled={!canManage}
					onclick={() => open(i)}>{i.installed ? 'Configure' : 'Connect'}</Button
				>
			</Card.Footer>
		</Card.Root>
	{/each}
</div>

<Sheet.Root open={!!editing} onOpenChange={(o) => !o && (editing = null)}>
	<Sheet.Content class="w-full sm:max-w-md">
		{#if editing}
			<form class="flex h-full flex-col" onsubmit={save}>
				<Sheet.Header>
					<Sheet.Title>{editing.name}</Sheet.Title>
					<Sheet.Description>{editing.description}</Sheet.Description>
				</Sheet.Header>
				<Field.Group class="gap-4 px-4">
					<Field.Field orientation="horizontal"
						><Switch id="int-enabled" bind:checked={enabled} /><Field.Label for="int-enabled"
							>Enabled</Field.Label
						></Field.Field
					>
					{#each editing.config as f (f.key)}
						{#if f.type === 'boolean'}
							<Field.Field orientation="horizontal">
								<Switch
									id="f-{f.key}"
									checked={!!values[f.key]}
									onCheckedChange={(v) => (values[f.key] = v)}
								/>
								<Field.Label for="f-{f.key}">{f.label}</Field.Label>
							</Field.Field>
						{:else}
							<Field.Field>
								<Field.Label for="f-{f.key}">{f.label}</Field.Label>
								<Input
									id="f-{f.key}"
									type={f.type === 'secret' ? 'password' : f.type === 'url' ? 'url' : 'text'}
									placeholder={'placeholder' in f ? f.placeholder : undefined}
									value={String(values[f.key] ?? '')}
									oninput={(e) => (values[f.key] = e.currentTarget.value)}
								/>
								{#if f.description}<Field.Description>{f.description}</Field.Description>{/if}
							</Field.Field>
						{/if}
					{/each}
					<p class="text-xs text-muted-foreground">Listens to: {editing.events.join(', ')}</p>
				</Field.Group>
				<Sheet.Footer><Button type="submit">Save</Button></Sheet.Footer>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
