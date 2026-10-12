import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '#lib/server/context.ts';

const state = vi.hoisted(() => ({
	property: vi.fn(),
	unit: vi.fn(),
	tenant: vi.fn(),
	current: vi.fn(),
	member: vi.fn(),
	transaction: vi.fn(),
	update: vi.fn(),
	emit: vi.fn(),
	written: {} as Record<string, unknown>
}));
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		query: {
			property: { findFirst: state.property },
			unit: { findFirst: state.unit },
			tenant: { findFirst: state.tenant },
			maintenanceTicket: { findFirst: state.current }
		},
		select: () => ({ from: () => ({ where: state.member }) }),
		transaction: state.transaction,
		update: state.update
	}
}));
vi.mock('#lib/server/services/events.ts', () => ({ emit: state.emit }));
vi.mock('#lib/server/services/notifications.ts', () => ({
	notifyTicketEmergency: vi.fn(),
	notifyTicketStatus: vi.fn(),
	notifyWorkOrder: vi.fn()
}));
vi.mock('#lib/server/features.ts', () => ({ hasFeature: () => false }));
vi.mock('#lib/server/ai/decisions.ts', () => ({ intakeTicket: vi.fn() }));
vi.mock('#lib/server/services/assets.ts', () => ({ assertAsset: vi.fn() }));
vi.mock('#lib/server/services/vendors.ts', () => ({ assertVendor: vi.fn() }));
vi.mock('#lib/server/services/documents.ts', () => ({ entityImages: vi.fn() }));
vi.mock('#lib/server/services/work-orders.ts', () => ({ workOrderToken: vi.fn() }));
vi.mock('#lib/server/demo-mode.ts', () => ({ isDemo: () => false }));
import { createTicket, updateTicket } from './maintenance.ts';

const ctx = { orgId: 'org-a', userId: 'user-a' } as OrgContext;
const current = {
	id: 'ticket-a',
	organizationId: 'org-a',
	propertyId: 'p-a',
	unitId: 'u-a',
	tenantId: 't-a',
	assigneeId: null,
	status: 'open',
	title: 'Initial'
};

beforeEach(() => {
	vi.clearAllMocks();
	state.property.mockResolvedValue({ id: 'p-a', name: 'A' });
	state.unit.mockResolvedValue({ id: 'u-a' });
	state.tenant.mockResolvedValue({ id: 't-a' });
	state.member.mockResolvedValue([{ id: 'membership-a' }]);
	state.current.mockResolvedValue(current);
	state.update.mockImplementation(() => ({
		set: (data: Record<string, unknown>) => {
			state.written = data;
			return { where: () => ({ returning: async () => [{ ...current, ...data }] }) };
		}
	}));
});

// Evaluate the service's real Drizzle callback against an available foreign row.
// A query that drops the org/property predicate would return that row and fail the test.
const foreignFixture =
	(row: Record<string, unknown>) =>
	({
		where
	}: {
		where: (
			row: Record<string, unknown>,
			ops: { and: (...terms: boolean[]) => boolean; eq: (a: unknown, b: unknown) => boolean }
		) => boolean;
	}) =>
		where(row, { and: (...terms) => terms.every(Boolean), eq: (a, b) => a === b })
			? row
			: undefined;

describe('maintenance relationship isolation at shared service boundary', () => {
	it('rejects a foreign property on PATCH before updating or emitting', async () => {
		state.property.mockImplementation(
			foreignFixture({ id: 'p-foreign', organizationId: 'org-b', name: 'Foreign' })
		);
		await expect(
			updateTicket(ctx, { id: 'ticket-a', propertyId: 'p-foreign' })
		).rejects.toMatchObject({ status: 404 });
		expect(state.update).not.toHaveBeenCalled();
		expect(state.emit).not.toHaveBeenCalled();
	});
	it('checks existing unit against a replacement property rather than only validating submitted fields', async () => {
		state.unit.mockResolvedValue(undefined);
		await expect(
			updateTicket(ctx, { id: 'ticket-a', propertyId: 'p-other' })
		).rejects.toMatchObject({ status: 404 });
		expect(state.unit).toHaveBeenCalled();
		expect(state.update).not.toHaveBeenCalled();
	});
	it.each(['unitId', 'tenantId', 'assigneeId'] as const)(
		'rejects a foreign %s on creation without entering a write transaction',
		async (key) => {
			if (key === 'unitId')
				state.unit.mockImplementation(
					foreignFixture({ id: 'foreign', organizationId: 'org-b', propertyId: 'p-a' })
				);
			if (key === 'tenantId')
				state.tenant.mockImplementation(foreignFixture({ id: 'foreign', organizationId: 'org-b' }));
			if (key === 'assigneeId') state.member.mockResolvedValue([]);
			await expect(
				createTicket(ctx, {
					propertyId: 'p-a',
					title: 'aa',
					priority: 'normal',
					status: 'open',
					[key]: 'foreign'
				})
			).rejects.toMatchObject({ status: 404 });
			expect(state.transaction).not.toHaveBeenCalled();
			expect(state.emit).not.toHaveBeenCalled();
		}
	);
	it('preserves an ordinary update with valid same-workspace associations', async () => {
		await expect(updateTicket(ctx, { id: 'ticket-a', title: 'Updated' })).resolves.toMatchObject({
			title: 'Updated'
		});
		expect(state.update).toHaveBeenCalledOnce();
		expect(state.emit).toHaveBeenCalledOnce();
	});
	it('allows explicitly clearing optional associations', async () => {
		await expect(
			updateTicket(ctx, { id: 'ticket-a', unitId: null, tenantId: null, assigneeId: null })
		).resolves.toMatchObject({ unitId: null, tenantId: null, assigneeId: null });
		expect(state.unit).not.toHaveBeenCalled();
		expect(state.tenant).not.toHaveBeenCalled();
		expect(state.member).not.toHaveBeenCalled();
	});
});
