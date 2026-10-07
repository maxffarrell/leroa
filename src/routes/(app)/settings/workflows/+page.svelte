<script lang="ts">
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import {
		deleteWorkflow,
		getWorkflows,
		saveWorkflow,
		updateWorkflow
	} from '#lib/remote/workflows.remote.ts';
	import { getProperties } from '#lib/remote/portfolio.remote.ts';
	import { WORKFLOW_ACTIONS, WORKFLOW_EVENT_SUGGESTIONS, ticketPriorities } from '#lib/schemas.ts';
	import { formatRelative } from '#lib/format.ts';
	import Zap from '@lucide/svelte/icons/zap';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const isAdmin = $derived(page.data.role !== 'member');
	const rules = $derived(await getWorkflows());
	const properties = $derived(await getProperties());

	const ACTION_LABELS: Record<(typeof WORKFLOW_ACTIONS)[number], string> = {
		notify: 'Notify the team',
		create_ticket: 'Create a work order'
	};

	let name = $state('');
	let eventType = $state('maintenance.created');
	let action = $state<(typeof WORKFLOW_ACTIONS)[number]>('notify');
	let message = $state('');
	let title = $state('');
	let priority = $state<(typeof ticketPriorities)[number]>('normal');
	let propertyId = $state('');
	let saving = $state(false);

	const eventValid = $derived(/^(\*|[a-z_]+\.[a-z_]+)$/.test(eventType.trim()));

	async function add() {
		if (!name.trim() || !eventValid) return;
		saving = true;
		try {
			await saveWorkflow({
				name: name.trim(),
				eventType: eventType.trim(),
				action,
				config: {
					message: action === 'notify' ? message.trim() || null : null,
					title: action === 'create_ticket' ? title.trim() || null : null,
					priority: action === 'create_ticket' ? priority : null,
					propertyId: action === 'create_ticket' ? propertyId || null : null
				}
			});
			name = '';
			message = '';
			title = '';
			toast.success('Rule added');
		} catch (e) {
			toast.error((e as { body?: { message?: string } })?.body?.message ?? 'Could not save rule');
		} finally {
			saving = false;
		}
	}

	const describe = (r: (typeof rules)[number]) =>
		r.action === 'notify'
			? r.config.message
				? `Message: “${r.config.message}”`
				: 'Inbox + email to owner/admin'
			: `Work order${r.config.title ? ` “${r.config.title}”` : ''} · ${r.config.priority ?? 'normal'}`;
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Workflows</Card.Title>
		<Card.Description>
			When something happens in Leroa, do something about it — automatically. Rules run on the same
			events webhooks use (e.g. <code>maintenance.created</code>), and can notify the team or open a
			work order.
		</Card.Description>
	</Card.Header>
	<Card.Content class="space-y-4">
		<div class="overflow-hidden rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Rule</Table.Head>
						<Table.Head>When</Table.Head>
						<Table.Head class="hidden md:table-cell">Then</Table.Head>
						<Table.Head class="hidden text-right sm:table-cell">Runs</Table.Head>
						<Table.Head class="w-10"></Table.Head>
						<Table.Head class="w-10"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rules as r (r.id)}
						<Table.Row class={r.enabled ? '' : 'opacity-60'}>
							<Table.Cell class="max-w-40">
								<span class="block truncate font-medium">{r.name}</span>
								<span class="block truncate text-xs text-muted-foreground md:hidden"
									>{describe(r)}</span
								>
								{#if r.lastRunAt}
									<span class="block text-xs text-muted-foreground"
										>Last run {formatRelative(r.lastRunAt)}</span
									>
								{/if}
							</Table.Cell>
							<Table.Cell
								><Badge variant="secondary" class="font-mono text-xs">{r.eventType}</Badge
								></Table.Cell
							>
							<Table.Cell class="hidden max-w-56 md:table-cell">
								<span class="block truncate text-sm text-muted-foreground">{describe(r)}</span>
							</Table.Cell>
							<Table.Cell class="hidden text-right text-sm tabular-nums sm:table-cell"
								>{r.runCount}</Table.Cell
							>
							<Table.Cell>
								{#if isAdmin}
									<Switch
										aria-label="Enable {r.name}"
										checked={r.enabled}
										onCheckedChange={(c) => updateWorkflow({ id: r.id, enabled: c === true })}
									/>
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if isAdmin}
									<Button
										variant="ghost"
										size="icon-sm"
										aria-label="Delete {r.name}"
										onclick={() => deleteWorkflow(r.id)}
										><Trash2 class="size-4 text-muted-foreground" /></Button
									>
								{/if}
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={6} class="py-8 text-center text-muted-foreground"
								>No rules yet — add one below.</Table.Cell
							></Table.Row
						>
					{/each}
					{#if isAdmin}
						<Table.Row class="border-dashed bg-muted/30 hover:bg-muted/30">
							<Table.Cell colspan={6}>
								<div class="flex flex-wrap items-center gap-2">
									<Zap class="size-4 shrink-0 text-muted-foreground" />
									<Input
										placeholder="Rule name"
										class="h-8 w-40"
										bind:value={name}
										aria-label="Rule name"
									/>
									<span class="text-xs text-muted-foreground">when</span>
									<div>
										<Input
											list="workflow-events"
											class="h-8 w-52 font-mono text-xs {eventType.trim() && !eventValid
												? 'border-destructive'
												: ''}"
											bind:value={eventType}
											aria-label="Event type"
										/>
										<datalist id="workflow-events">
											{#each WORKFLOW_EVENT_SUGGESTIONS as ev (ev)}
												<option value={ev}></option>
											{/each}
										</datalist>
									</div>
									<span class="text-xs text-muted-foreground">then</span>
									<NativeSelect.Root aria-label="Action" size="sm" bind:value={action} class="w-44">
										{#each WORKFLOW_ACTIONS as a (a)}
											<NativeSelect.Option value={a}>{ACTION_LABELS[a]}</NativeSelect.Option>
										{/each}
									</NativeSelect.Root>
								</div>
								{#if action === 'notify'}
									<div class="mt-2 flex items-center gap-2">
										<Input
											placeholder={'Note (optional) — {summary} and {event} are filled in'}
											class="h-8 max-w-md text-sm"
											bind:value={message}
											aria-label="Notification message"
										/>
									</div>
								{:else}
									<div class="mt-2 flex flex-wrap items-center gap-2">
										<Input
											placeholder="Work order title (optional)"
											class="h-8 w-56 text-sm"
											bind:value={title}
											aria-label="Work order title"
										/>
										<NativeSelect.Root
											aria-label="Priority"
											size="sm"
											bind:value={priority}
											class="w-28"
										>
											{#each ticketPriorities as p (p)}
												<NativeSelect.Option value={p}>{p}</NativeSelect.Option>
											{/each}
										</NativeSelect.Root>
										<NativeSelect.Root
											aria-label="Property"
											size="sm"
											bind:value={propertyId}
											class="w-44"
										>
											<NativeSelect.Option value="">Event's property</NativeSelect.Option>
											{#each properties as p (p.id)}
												<NativeSelect.Option value={p.id}>{p.name}</NativeSelect.Option>
											{/each}
										</NativeSelect.Root>
									</div>
								{/if}
								<div class="mt-2">
									<Button size="sm" disabled={saving || !name.trim() || !eventValid} onclick={add}
										><Plus /> Add rule</Button
									>
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
		{#if !isAdmin}
			<p class="text-sm text-muted-foreground">Only owners and admins can change rules.</p>
		{/if}
	</Card.Content>
</Card.Root>
