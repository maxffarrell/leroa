<script lang="ts">
	import Logo from '#lib/components/app/logo.svelte';
	let { children } = $props();
</script>

<div class="grid min-h-svh lg:grid-cols-2">
	<div class="flex flex-col gap-4 p-6 md:p-10">
		<a href="/" class="flex items-center gap-2 font-semibold"><Logo /> Leroa</a>
		<div class="flex flex-1 items-center justify-center">
			<div class="w-full max-w-sm">{@render children()}</div>
		</div>
	</div>
	<div class="relative hidden overflow-hidden bg-muted lg:block">
		<div
			class="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,var(--color-primary)/0.08,transparent_60%)]"
		></div>
		<div class="absolute inset-x-12 bottom-12 space-y-3">
			<p class="text-2xl font-semibold tracking-tight text-balance">
				Run your rentals from one fast, keyboard-friendly workspace.
			</p>
			<p class="text-sm text-muted-foreground">
				Properties, leases, rent, maintenance and a tenant portal. Open source, self-hostable.
			</p>
		</div>
	</div>
</div>
