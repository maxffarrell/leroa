<script lang="ts">
	let { body }: { body: string } = $props();
	const blocks = $derived(
		body
			.replace(/\r\n?/g, '\n')
			.split('\n')
			.map((line) => ({ heading: line.startsWith('# '), text: line.replace(/^# /, '') }))
	);
</script>

<div class="space-y-1 text-sm leading-relaxed">
	{#each blocks as b, i (i)}
		{#if b.heading}
			<h3 class="pt-3 font-semibold first:pt-0">{b.text}</h3>
		{:else if b.text.trim()}
			<p class="whitespace-pre-wrap">{b.text}</p>
		{:else}
			<div class="h-2"></div>
		{/if}
	{/each}
</div>
