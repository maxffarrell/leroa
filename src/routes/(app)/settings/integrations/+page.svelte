<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import {
		disconnectIntegration,
		getIntegrations,
		getSyncIssues,
		saveIntegration,
		syncIntegration
	} from '#lib/remote/workspace.remote.ts';
	import { formatDate, formatMoney } from '#lib/format.ts';
	import { toast } from 'svelte-sonner';
	import Puzzle from '@lucide/svelte/icons/puzzle';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Copy from '@lucide/svelte/icons/copy';

	type Integration = Awaited<ReturnType<typeof getIntegrations>>[number];
	const list = $derived(await getIntegrations());
	const canManage = $derived(page.data.role !== 'member');
	let editingId = $state<string | null>(null);
	const editing = $derived(list.find((i) => i.id === editingId) ?? null);
	let values = $state<Record<string, string | boolean>>({});
	let enabled = $state(true);
	let syncing = $state(false);
	let confirmDisconnect = $state(false);

	const message = (err: unknown, fallback: string) =>
		(err as { body?: { message?: string } })?.body?.message ?? fallback;

	function open(i: Integration) {
		editingId = i.id;
		confirmDisconnect = false;
		enabled = i.installed ? i.enabled : true;
		values = { ...i.values };
		for (const f of i.config) {
			if (f.type === 'boolean' && values[f.key] === '') values[f.key] = f.default ?? false;
		}
	}

	const CONNECT_ERRORS: Record<string, string> = {
		denied: 'Connection cancelled',
		expired: 'That connection attempt expired. Try again.',
		failed: 'Could not connect. Try again.'
	};

	onMount(() => {
		const params = page.url.searchParams;
		const id = params.get('integration');
		const i = id ? list.find((x) => x.id === id) : undefined;
		if (!i) return;
		if (params.get('connected')) toast.success(`${i.name} connected. The first sync has started.`);
		const err = params.get('error');
		if (err) toast.error(CONNECT_ERRORS[err] ?? CONNECT_ERRORS.failed!);
		open(i);
		void goto(page.url.pathname, { replace: true, reset: false });
	});

	async function save(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		try {
			await saveIntegration({ id: editing.id, enabled, config: values });
			toast.success(`${editing.name} saved`);
			editingId = null;
		} catch (err) {
			toast.error(message(err, 'Could not save'));
		}
	}

	async function syncNow(i: Integration) {
		syncing = true;
		try {
			const r = await syncIntegration(i.id);
			if (r.error) toast.error(r.error);
			else
				toast.success(
					r.synced || r.removed
						? `Sent ${r.synced} record${r.synced === 1 ? '' : 's'} to ${i.name}`
						: 'Everything is up to date'
				);
		} catch (err) {
			toast.error(message(err, 'Could not sync'));
		} finally {
			syncing = false;
		}
	}

	async function disconnect(i: Integration) {
		if (!confirmDisconnect) {
			confirmDisconnect = true;
			return;
		}
		try {
			await disconnectIntegration(i.id);
			toast.success(`${i.name} disconnected`);
			confirmDisconnect = false;
		} catch (err) {
			toast.error(message(err, 'Could not disconnect'));
		}
	}

	const svgWithNamespace = (svg: string) =>
		svg.includes('xmlns=') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
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
							src="data:image/svg+xml,{encodeURIComponent(svgWithNamespace(i.icon))}"
						/>{:else}<Puzzle />{/if}
				</span>
				<div class="min-w-0 flex-1 space-y-1">
					<Card.Title class="flex flex-wrap items-center gap-2"
						>{i.name}
						{#if i.connection?.status === 'reconnect'}<Badge variant="destructive"
								>Reconnect needed</Badge
							>{:else if i.connection && !i.enabled}<Badge variant="outline">Paused</Badge
							>{:else if i.connection}<Badge variant="secondary">Connected</Badge
							>{:else if !i.connects && i.installed && i.enabled}<Badge variant="secondary"
								>On</Badge
							>{/if}</Card.Title
					>
					<Card.Description>{i.description}</Card.Description>
				</div>
			</Card.Header>
			<Card.Footer class="justify-between text-xs text-muted-foreground">
				<span>by {i.author.name}</span>
				<Button
					size="sm"
					variant={i.installed || i.connection ? 'outline' : 'default'}
					disabled={!canManage}
					onclick={() => open(i)}
					>{i.connection ? 'Manage' : i.installed && !i.connects ? 'Configure' : 'Connect'}</Button
				>
			</Card.Footer>
		</Card.Root>
	{/each}
</div>

<Sheet.Root open={!!editing} onOpenChange={(o) => !o && (editingId = null)}>
	<Sheet.Content class="w-full overflow-y-auto sm:max-w-md">
		{#if editing}
			<form class="flex min-h-full flex-col" onsubmit={save}>
				<Sheet.Header>
					<Sheet.Title>{editing.name}</Sheet.Title>
					<Sheet.Description>{editing.description}</Sheet.Description>
				</Sheet.Header>
				{#if editing.connects}
					{@const c = editing.connection}
					<section class="mx-4 mb-4 space-y-3 rounded-md border p-3 text-sm">
						{#if c}
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="font-medium">
										{c.status === 'reconnect' ? 'Disconnected' : 'Connected'}{c.accountName
											? ` to ${c.accountName}`
											: ''}
									</p>
									<p class="text-xs text-muted-foreground">
										{#if c.syncing || syncing}Syncing…{:else if c.lastSyncAt}Last synced {formatDate(
												c.lastSyncAt
											)} at {new Date(c.lastSyncAt).toLocaleTimeString([], {
												hour: 'numeric',
												minute: '2-digit'
											})}{:else}Not synced yet{/if}
									</p>
								</div>
								{#if c.status === 'connected'}
									<Button
										size="sm"
										variant="outline"
										disabled={syncing || c.syncing || !editing.enabled}
										onclick={() => syncNow(editing!)}
										><RefreshCw class={syncing ? 'animate-spin' : ''} />Sync now</Button
									>
								{/if}
							</div>
							{#if c.lastError}<p class="text-xs text-destructive" role="alert">
									{c.lastError}
								</p>{/if}
							{#if !editing.enabled}<p class="text-xs text-muted-foreground">
									Syncing is paused while this integration is turned off.
								</p>{/if}
							<p class="text-xs text-muted-foreground">
								{plural(c.counts.synced, 'record')} in {editing.name}{#if c.counts.failed}, <span
										class="text-destructive">{c.counts.failed} failed</span
									>{/if}{#if c.counts.skipped}, {c.counts.skipped} skipped{/if}{#if c.lastSyncResult?.remaining}.
									{c.lastSyncResult.remaining} more will go next sync{/if}.
							</p>
							{#if c.counts.failed || c.counts.skipped}
								<details class="text-xs">
									<summary class="cursor-pointer text-muted-foreground"
										>Show records not synced</summary
									>
									{#await getSyncIssues(editing.id) then issues}
										<ul class="mt-2 max-h-64 divide-y overflow-y-auto rounded border">
											{#each issues as issue (issue.id)}
												<li class="space-y-0.5 px-2 py-1.5">
													<div class="flex items-baseline justify-between gap-2">
														{#if issue.href}<a
																class="font-medium underline-offset-2 hover:underline"
																href={issue.href}>{issue.label}</a
															>{:else}<span class="font-medium">{issue.label}</span>{/if}
														{#if issue.amount != null}<span class="tabular-nums"
																>{formatMoney(issue.amount, issue.currency ?? 'USD')}</span
															>{/if}
													</div>
													{#if issue.detail}<p class="text-muted-foreground">{issue.detail}</p>{/if}
													<p
														class={issue.status === 'skipped'
															? 'text-muted-foreground'
															: 'text-destructive'}
													>
														{issue.status === 'skipped' ? 'Skipped: ' : ''}{issue.error}
													</p>
												</li>
											{/each}
										</ul>
									{/await}
								</details>
							{/if}
							<div class="flex flex-wrap gap-2">
								{#if c.status === 'reconnect' && editing.app?.configured}
									<Button
										size="sm"
										href="/api/integrations/{editing.id}/connect"
										data-sveltekit-reload>Reconnect</Button
									>
								{/if}
								<Button
									size="sm"
									variant={confirmDisconnect ? 'destructive' : 'ghost'}
									onclick={() => disconnect(editing!)}
									>{confirmDisconnect ? 'Confirm disconnect' : 'Disconnect'}</Button
								>
							</div>
						{:else if editing.app?.configured}
							<p class="text-muted-foreground">
								Sign in to {editing.name} and choose the company to send records to. Leroa only adds records;
								it never changes or deletes ones you entered there yourself.
							</p>
							<Button href="/api/integrations/{editing.id}/connect" data-sveltekit-reload
								>Connect to {editing.name}</Button
							>
						{:else}
							<p class="text-muted-foreground">
								{editing.name} isn't set up on this server yet. Set
								{#each editing.app?.env ?? [] as name, n (name)}{n ? ' and ' : ''}<code>{name}</code
									>{/each} from your developer app, and register this redirect URI:
							</p>
							<div class="flex items-center gap-2">
								<code class="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs"
									>{editing.app?.redirectUri}</code
								>
								<Button
									size="icon"
									variant="ghost"
									aria-label="Copy redirect URI"
									onclick={() => {
										void navigator.clipboard.writeText(editing!.app?.redirectUri ?? '');
										toast.success('Copied');
									}}><Copy /></Button
								>
							</div>
						{/if}
					</section>
				{/if}
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
								<Field.Content>
									<Field.Label for="f-{f.key}">{f.label}</Field.Label>
									{#if f.description}<Field.Description>{f.description}</Field.Description>{/if}
								</Field.Content>
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
					{#if editing.events.length}
						<p class="text-xs text-muted-foreground">Listens to: {editing.events.join(', ')}</p>
					{/if}
				</Field.Group>
				<Sheet.Footer><Button type="submit">Save</Button></Sheet.Footer>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
