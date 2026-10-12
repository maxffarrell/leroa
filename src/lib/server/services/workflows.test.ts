import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeroaEvent } from './events.ts';

const state = vi.hoisted(() => ({ rules: [] as unknown[], create: vi.fn(), notify: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		select: () => ({ from: () => ({ where: async () => state.rules }) }),
		update: () => ({ set: () => ({ where: async () => [] }) })
	}
}));
vi.mock('#lib/server/services/maintenance.ts', () => ({ createTicket: state.create }));
vi.mock('#lib/server/services/inbox.ts', () => ({ inboxForManagers: state.notify }));
vi.mock('#lib/server/email.ts', () => ({
	appOrigin: () => 'https://example.test',
	sendEmail: vi.fn()
}));
vi.mock('#lib/server/email-template.ts', () => ({ renderEmail: vi.fn() }));
vi.mock('#lib/server/branding.ts', () => ({ orgBrand: async () => ({ name: 'Example' }) }));
import { runWorkflows } from './workflows.ts';

const event = (organizationId = 'org-a', workflowCreated = false): LeroaEvent => ({
	id: 'event',
	type: 'maintenance.created',
	organizationId,
	entity: { type: 'maintenance', id: 'ticket' },
	summary: 'aa',
	data: { workflowCreated },
	createdAt: new Date().toISOString()
});

beforeEach(() => {
	state.rules = [
		{
			id: 'rule',
			eventType: '*',
			action: 'create_ticket',
			config: { propertyId: 'p-a', title: 'aa' },
			runCount: 0
		}
	];
	state.create.mockReset();
	state.notify.mockReset();
});

describe('workflow ticket causality', () => {
	it('stops generated events after asynchronous rule loading without suppressing the initial action', async () => {
		let nested: Promise<void> | undefined;
		state.create.mockImplementation(async (ctx) => {
			if (state.create.mock.calls.length > 1) throw new Error('amplification');
			nested = runWorkflows(event(ctx.orgId, ctx.workflowCreated === true));
		});
		await runWorkflows(event());
		await nested;
		expect(state.create).toHaveBeenCalledTimes(1);
		expect(state.create.mock.calls[0][0]).toMatchObject({ workflowCreated: true });
	});
	it('does not suppress a concurrent independent workspace event', async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		state.create.mockImplementation(async () => pending);
		const first = runWorkflows(event('org-a'));
		const second = runWorkflows(event('org-b'));
		await Promise.resolve();
		await Promise.resolve();
		release();
		await Promise.all([first, second]);
		expect(state.create).toHaveBeenCalledTimes(2);
	});
});
