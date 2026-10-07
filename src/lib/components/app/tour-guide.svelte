<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '#lib/utils.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import X from '@lucide/svelte/icons/x';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	let { userId }: { userId: string } = $props();

	type Step = { title: string; body: string; anchor?: string };
	const steps: Step[] = [
		{
			title: 'Welcome to Leroa',
			body: 'Leases, rent, maintenance, leasing and documents live in one workspace. Two minutes to see where things are.'
		},
		{
			title: 'Jump anywhere',
			body: 'Search, ⌘K or press G then a letter (like G R for Rent) to move without touching the mouse.',
			anchor: 'search'
		},
		{
			title: 'Dashboard',
			body: 'Your day at a glance: what needs attention, collections progress and work in flight.',
			anchor: '/dashboard'
		},
		{
			title: 'Portfolio',
			body: 'Properties and units sit at the top of everything — tenants, leases and work orders all hang off them.',
			anchor: '/properties'
		},
		{
			title: 'Leasing pipeline',
			body: 'Leads, applications, waitlists and public listings. Marketing feeds straight into tenants.',
			anchor: '/leasing'
		},
		{
			title: 'Leases & rent',
			body: 'Active leases generate rent charges automatically each month; record payments on the Rent roll.',
			anchor: '/leases'
		},
		{
			title: 'Maintenance',
			body: 'Requests, unit turns, PM schedules and assets. Vendors get private job links — no account needed.',
			anchor: '/maintenance'
		},
		{
			title: 'Messages',
			body: 'Threads with tenants and announcements, with the resident portal alongside.',
			anchor: '/messages'
		},
		{
			title: 'Settings & integrations',
			body: 'Team, payments, API keys, QuickBooks/Xero and notification prefs live under Settings.',
			anchor: '/settings'
		},
		{
			title: "You're set",
			body: 'Replay this tour any time from Settings → General. Press ⌘K and start exploring.'
		}
	];

	const STORAGE = $derived(`leroa:tour:seen:${userId}`);
	const PENDING = 'leroa:tour:pending';

	let open = $state(false);
	let index = $state(0);
	let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);

	const step = $derived(steps[index]);
	const last = $derived(index === steps.length - 1);

	function start() {
		index = 0;
		open = true;
	}
	function close() {
		open = false;
		rect = null;
		try {
			localStorage.setItem(STORAGE, '1');
		} catch {
			/* private mode */
		}
	}
	function go(i: number) {
		index = Math.min(Math.max(i, 0), steps.length - 1);
	}

	function measure() {
		const sel = step?.anchor;
		if (!open || !sel) return (rect = null);
		const el = document.querySelector(`[data-tour="${CSS.escape(sel)}"]`);
		if (!el) return (rect = null);
		const r = el.getBoundingClientRect();
		rect = { top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 };
		el.scrollIntoView({ block: 'nearest' });
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		const url = page.url;
		if (url.searchParams.get('tour') === '1') {
			start();
			return;
		}
		try {
			if (localStorage.getItem(PENDING) && !localStorage.getItem(STORAGE)) {
				localStorage.removeItem(PENDING);
				start();
			} else if (page.data.demo && !localStorage.getItem(STORAGE)) {
				start();
			}
		} catch {
			/* localStorage unavailable */
		}
	});

	$effect(() => {
		if (open) measure();
	});

	const cardStyle = $derived.by(() => {
		if (!rect) {
			return 'left: 50%; top: 16%; transform: translateX(-50%);';
		}
		const w = Math.min(288, window.innerWidth - 32);
		let left = rect.left + rect.width + 14;
		if (left + w > window.innerWidth - 12) left = Math.max(12, rect.left - w - 14);
		if (left < 12) left = 12;
		let top = rect.top + rect.height / 2 - 60;
		top = Math.min(Math.max(12, top), window.innerHeight - 220);
		return `left: ${left}px; top: ${top}px;`;
	});

	function onkeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') close();
		else if (e.key === 'ArrowRight') go(index + 1);
		else if (e.key === 'ArrowLeft') go(index - 1);
	}
</script>

<svelte:window {onkeydown} onresize={measure} onscroll={measure} />

{#if open}
	{#if rect}
		<div
			class="pointer-events-none fixed z-40 rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-200"
			style="top:{rect.top}px;left:{rect.left}px;width:{rect.width}px;height:{rect.height}px"
			aria-hidden="true"
		></div>
	{/if}
	<div
		class="fixed z-50 w-72 rounded-xl bg-popover p-4 text-popover-foreground shadow-md ring-1 ring-foreground/10"
		style={cardStyle}
		role="dialog"
		aria-label="Tour: {step.title}"
	>
		<div class="flex items-start justify-between gap-2">
			<h2 class="text-sm font-semibold">{step.title}</h2>
			<Button size="icon-xs" variant="ghost" aria-label="Skip tour" onclick={close}><X /></Button>
		</div>
		<p class="mt-1 text-sm text-muted-foreground">{step.body}</p>
		<div class="mt-3 flex items-center gap-2">
			<Button variant="ghost" size="sm" onclick={close}>Skip</Button>
			<div class="flex flex-1 items-center justify-center gap-1">
				{#each steps as s, i (s.title)}
					<span
						class={cn(
							'size-1.5 rounded-full',
							i === index ? 'bg-primary' : 'bg-muted-foreground/30'
						)}
					></span>
				{/each}
			</div>
			{#if index > 0}
				<Button size="icon-sm" variant="ghost" aria-label="Back" onclick={() => go(index - 1)}
					><ArrowLeft /></Button
				>
			{/if}
			<Button size="sm" onclick={() => (last ? close() : go(index + 1))}>
				{last ? 'Done' : 'Next'}<ArrowRight />
			</Button>
		</div>
	</div>
{/if}
