<script lang="ts">
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		API_RESOURCES,
		API_RESOURCE_LABELS,
		everything,
		levelOf,
		withLevel,
		type AccessLevel,
		type ApiPermissions
	} from '#lib/api-permissions.ts';

	let { value = $bindable({}) }: { value?: ApiPermissions } = $props();
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<span class="text-sm font-medium">Permissions</span>
		<div class="flex gap-1">
			<Button type="button" size="sm" variant="ghost" onclick={() => (value = everything('read'))}
				>Read-only</Button
			>
			<Button type="button" size="sm" variant="ghost" onclick={() => (value = everything('write'))}
				>Full access</Button
			>
			<Button type="button" size="sm" variant="ghost" onclick={() => (value = {})}>Clear</Button>
		</div>
	</div>
	<ul class="divide-y rounded-lg border">
		{#each API_RESOURCES as r (r)}
			<li class="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
				<span class="flex-1 text-sm">{API_RESOURCE_LABELS[r]}</span>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					aria-label="{API_RESOURCE_LABELS[r]} access"
					bind:value={
						() => levelOf(value, r), (l) => l && (value = withLevel(value, r, l as AccessLevel))
					}
				>
					<ToggleGroup.Item value="none">None</ToggleGroup.Item>
					<ToggleGroup.Item value="read">Read</ToggleGroup.Item>
					<ToggleGroup.Item value="write">Read &amp; write</ToggleGroup.Item>
				</ToggleGroup.Root>
			</li>
		{/each}
	</ul>
</div>
