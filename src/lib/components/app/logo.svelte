<script lang="ts">
	import { cn } from '#lib/utils.js';
	let { class: className = '' }: { class?: string } = $props();
</script>

<span
	class={cn(
		'flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground',
		className
	)}
>
	<svg
		viewBox="0 0 24 24"
		class="size-4"
		fill="none"
		stroke="currentColor"
		stroke-width="2.25"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M3 11 12 4l9 7" />
		<path d="M6 10v9h12v-9" />
		<path d="M10 19v-5h4v5" />
	</svg>
</span>
