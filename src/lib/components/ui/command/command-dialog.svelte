<script lang="ts">
	import * as Modal from '#lib/components/ui/modal/index.js';
	import { cn, type WithoutChildrenOrChild } from '#lib/utils.js';
	import Command from './command.svelte';
	import type { Command as CommandPrimitive, Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		ref = $bindable(null),
		value = $bindable(''),
		title = 'Command Palette',
		description = 'Search for a command to run...',
		showCloseButton = false,
		children,
		class: className,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.RootProps> &
		WithoutChildrenOrChild<CommandPrimitive.RootProps> & {
			children: Snippet;
			title?: string;
			description?: string;
			showCloseButton?: boolean;
			class?: string;
		} = $props();
</script>

<Modal.Root bind:open {...restProps}>
	<Modal.Header class="sr-only">
		<Modal.Title>{title}</Modal.Title>
		<Modal.Description>{description}</Modal.Description>
	</Modal.Header>
	<Modal.Content
		class={cn('overflow-hidden rounded-xl! p-0 md:top-1/3 md:translate-y-0', className)}
		{showCloseButton}
	>
		<Command {...restProps} bind:value bind:ref {children} />
	</Modal.Content>
</Modal.Root>
