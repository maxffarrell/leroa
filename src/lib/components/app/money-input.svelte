<script lang="ts">
	import * as InputGroup from '#lib/components/ui/input-group/index.js';

	/** Two-way bound value is in cents. */
	let {
		value = $bindable<number | null>(null),
		id,
		required = false,
		placeholder = '0.00'
	}: { value?: number | null; id?: string; required?: boolean; placeholder?: string } = $props();
	let text = $state(value == null ? '' : (value / 100).toFixed(2));

	function oninput(e: Event) {
		text = (e.currentTarget as HTMLInputElement).value;
		const n = Number.parseFloat(text.replace(/[,$\s]/g, ''));
		value = Number.isFinite(n) ? Math.round(n * 100) : null;
	}
</script>

<InputGroup.Root>
	<InputGroup.Addon><InputGroup.Text>$</InputGroup.Text></InputGroup.Addon>
	<InputGroup.Input
		{id}
		{required}
		{placeholder}
		inputmode="decimal"
		class="tabular-nums"
		value={text}
		{oninput}
	/>
</InputGroup.Root>
