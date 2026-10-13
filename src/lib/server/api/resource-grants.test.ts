import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '../context.ts';
import { everything } from '#lib/api-permissions.ts';
const state = vi.hoisted(() => ({
	lease: vi.fn(),
	tenant: vi.fn(),
	vendor: vi.fn(),
	asset: vi.fn(),
	property: vi.fn(),
	rent: vi.fn(),
	verify: vi.fn(),
	provider: vi.fn(),
	ai: false
}));
vi.mock('#lib/server/context.ts', () => ({ requireOrg: vi.fn(), requirePerm: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		execute: vi.fn(async () => [{ property_id: 'p' }]),
		query: {
			organization: { findFirst: async () => ({ id: 'org', name: 'Org', slug: 'org' }) },
			member: { findMany: async () => [{ id: 'm', userId: 'actor', role: 'owner' }] }
		}
	}
}));
vi.mock('#lib/server/auth.ts', () => ({ auth: { api: { verifyApiKey: state.verify } } }));
vi.mock('#lib/server/services/portfolio.ts', () => ({
	listProperties: state.property,
	getProperty: state.property,
	listUnits: vi.fn(async () => []),
	listTenants: vi.fn(async () => []),
	getTenant: state.tenant,
	createProperty: vi.fn(),
	updateProperty: vi.fn(),
	createUnit: vi.fn(),
	updateUnit: vi.fn(),
	createTenant: vi.fn(),
	updateTenant: vi.fn()
}));
vi.mock('#lib/server/services/leasing.ts', () => ({
	listLeases: state.lease,
	getLease: state.lease,
	rentRoll: state.rent,
	createLease: vi.fn(),
	updateLease: vi.fn(),
	addCharge: vi.fn(),
	recordPayment: vi.fn()
}));
vi.mock('#lib/server/services/maintenance.ts', () => ({
	listTickets: vi.fn(async () => []),
	createTicket: vi.fn(),
	updateTicket: vi.fn()
}));
vi.mock('#lib/server/services/vendors.ts', () => ({
	listVendors: state.vendor,
	getVendor: state.vendor,
	createVendor: vi.fn(),
	updateVendor: vi.fn()
}));
vi.mock('#lib/server/services/assets.ts', () => ({
	listAssets: state.asset,
	getAsset: state.asset,
	createAsset: vi.fn(),
	updateAsset: vi.fn()
}));
vi.mock('#lib/server/services/schedules.ts', () => ({
	listSchedules: vi.fn(),
	createSchedule: vi.fn(),
	updateSchedule: vi.fn()
}));
vi.mock('#lib/server/services/turns.ts', () => ({
	listTurns: vi.fn(),
	startTurn: vi.fn(),
	updateTurn: vi.fn()
}));
vi.mock('#lib/server/services/inspections.ts', () => ({
	listInspections: vi.fn(),
	getInspection: vi.fn()
}));
vi.mock('#lib/server/services/messaging.ts', () => ({
	listThreads: vi.fn(),
	getThread: vi.fn(),
	sendStaffMessage: vi.fn(),
	listAnnouncements: vi.fn(),
	createAnnouncement: vi.fn()
}));
vi.mock('#lib/server/services/owners.ts', () => ({
	listOwners: vi.fn(),
	getOwner: vi.fn(),
	createOwner: vi.fn(),
	updateOwner: vi.fn()
}));
vi.mock('#lib/server/services/listings.ts', () => ({
	listListings: vi.fn(async () => []),
	getListing: vi.fn(),
	updateListing: vi.fn(),
	listApplications: vi.fn(),
	getApplication: vi.fn(),
	updateApplication: vi.fn()
}));
vi.mock('#lib/server/services/crm.ts', () => ({
	listLeads: vi.fn(async () => []),
	getLead: vi.fn(),
	createLead: vi.fn(),
	updateLead: vi.fn(),
	listTours: vi.fn(),
	getTour: vi.fn(),
	scheduleTour: vi.fn(),
	updateTour: vi.fn()
}));
vi.mock('#lib/server/services/reports.ts', () => ({ runReport: vi.fn() }));
vi.mock('#lib/server/ai/index.ts', () => ({ draftReply: vi.fn() }));
vi.mock('#lib/server/ai/client.ts', () => ({
	aiConfigured: () => state.ai,
	chatJson: state.provider
}));
import { apiContext } from './auth.ts';
import { resources } from './resources.ts';
import { askAssistant } from '../ai/assistant.ts';
const ctx = () =>
	({
		orgId: 'org',
		userId: 'actor',
		role: 'admin',
		perms: everything('read'),
		propertyIds: null
	}) as OrgContext;
beforeEach(() => {
	vi.clearAllMocks();
	state.ai = false;
	state.verify.mockResolvedValue({
		valid: true,
		key: { referenceId: 'org', permissions: { leases: ['read'] } }
	});
	state.lease.mockResolvedValue([
		{
			id: 'lease',
			status: 'active',
			tenants: 'PRIVATE RESIDENT',
			balance: 500,
			currency: 'usd',
			propertyName: 'Building',
			unitName: '1'
		}
	]);
	state.tenant.mockResolvedValue({ id: 'tenant' });
	state.vendor.mockResolvedValue([]);
	state.asset.mockResolvedValue([]);
	state.property.mockResolvedValue([]);
});
describe('explicit REST key grants', () => {
	it('retains verified grants and actor identity without acquiring session authority', async () => {
		const result = await apiContext(
			{
				request: new Request('https://test', { headers: { authorization: 'Bearer key' } }),
				params: { resource: 'leases' }
			} as never,
			'read'
		);
		expect(result).toMatchObject({
			orgId: 'org',
			role: 'admin',
			userId: 'actor',
			memberId: 'm',
			perms: { leases: ['read'], tenants: [] }
		});
	});
	it.each(['tenants', 'charges', 'payments'] as const)(
		'rejects lease aggregates missing %s before loading',
		async (missing) => {
			const c = ctx();
			delete c.perms![missing];
			await expect(resources.leases.list(c, new URL('https://test'))).rejects.toMatchObject({
				status: 403
			});
			await expect(resources.leases.get!(c, 'lease')).rejects.toMatchObject({ status: 403 });
			expect(state.lease).not.toHaveBeenCalled();
		}
	);
	it('keeps complete aggregate grants usable', async () => {
		expect(await resources.leases.list(ctx(), new URL('https://test'))).toHaveLength(1);
		expect(state.lease).toHaveBeenCalledWith('org', []);
	});
	it('forwards key context to nested and statistical projections', async () => {
		const c = ctx();
		await resources.tenants.get!(c, 'tenant');
		await resources.vendors.get!(c, 'vendor');
		await resources.assets.list(c, new URL('https://test'));
		expect(state.tenant).toHaveBeenCalledWith('org', 'tenant', c);
		expect(state.vendor).toHaveBeenCalledWith('org', 'vendor', c);
		expect(state.asset).toHaveBeenCalledWith(
			'org',
			{ propertyId: undefined, includeArchived: false },
			c
		);
	});
	it('enforces property and rent-roll aggregate contracts', async () => {
		const c = ctx();
		delete c.perms!.units;
		await expect(resources.properties.list(c, new URL('https://test'))).rejects.toMatchObject({
			status: 403
		});
		delete c.perms!.payments;
		await expect(resources.charges.list(c, new URL('https://test'))).rejects.toMatchObject({
			status: 403
		});
		expect(state.property).not.toHaveBeenCalled();
		expect(state.rent).not.toHaveBeenCalled();
	});
});
describe('assistant composite data grants', () => {
	it.each(['tenants', 'charges', 'payments'] as const)(
		'omits lease data when %s is denied in deterministic and provider paths',
		async (missing) => {
			const c = ctx();
			delete c.perms![missing];
			const answer = await askAssistant('org', 'Anyone behind on rent?', c);
			expect(JSON.stringify(answer)).not.toContain('PRIVATE RESIDENT');
			expect(answer.reply).toContain('permissions');
			expect(answer.reply).not.toContain('paid up');
			expect(state.lease).not.toHaveBeenCalled();
			state.ai = true;
			state.provider.mockResolvedValue({ reply: 'Okay', sources: [], action: null });
			await askAssistant('org', 'Anyone behind on rent?', c);
			expect(state.provider.mock.calls[0][1]).not.toContain('PRIVATE RESIDENT');
		}
	);
	it('preserves authorized arrears answers and context-aware vendor loading', async () => {
		const c = ctx();
		const result = await askAssistant('org', 'Anyone behind on rent?', c);
		expect(JSON.stringify(result)).toContain('PRIVATE RESIDENT');
		expect(state.vendor).toHaveBeenCalledWith('org', {}, c);
	});
});
