import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from './context.ts';

const state = vi.hoisted(() => ({ ctx: {} as OrgContext, execute: vi.fn(), permission: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({ db: { execute: state.execute } }));
vi.mock('./context.ts', () => ({
	requireOrg: async () => state.ctx,
	requirePerm: state.permission
}));
import {
	assertPermission,
	assertPortalDelegation,
	assertOwnerDelegation,
	assertRecordAccess,
	assertReferences,
	filterRecords,
	secureServices,
	staffOrgForRecord
} from './access.ts';
import {
	portfolioPolicy,
	crmPolicy,
	maintenancePolicy,
	vendorsPolicy,
	inspectionsPolicy
} from './access-policies.ts';

beforeEach(() => {
	state.ctx = { orgId: 'org-a', perms: null, propertyIds: ['p-a'] } as OrgContext;
	state.execute.mockReset().mockResolvedValue([{ property_id: 'p-a' }]);
	state.permission.mockReset().mockImplementation(async (resource, action = 'read') => {
		assertPermission(state.ctx, resource, action);
		return state.ctx;
	});
});

describe('browser operation authorization', () => {
	it('blocks a normal vendor update by a read-only custom role before invoking the service', async () => {
		state.ctx.perms = { vendors: ['read'] };
		const updateVendor = vi.fn();
		const svc = secureServices({ updateVendor }, { updateVendor: vendorsPolicy.updateVendor });
		await expect(
			svc.updateVendor(state.ctx, { id: 'v-a', email: 'redirect@example.test' })
		).rejects.toMatchObject({ status: 403 });
		expect(updateVendor).not.toHaveBeenCalled();
	});
	it('preserves a granted vendor lookup for a property-scoped role', async () => {
		state.ctx.perms = { vendors: ['read'] };
		state.execute.mockResolvedValue([{ property_id: null }]);
		const getVendor = vi.fn().mockResolvedValue({ id: 'v-a', jobs: [] });
		const svc = secureServices({ getVendor }, { getVendor: vendorsPolicy.getVendor });
		await expect(svc.getVendor('org-a', 'v-a')).resolves.toMatchObject({ id: 'v-a' });
		expect(getVendor).toHaveBeenCalled();
	});
	it('authorizes generic update id independently of an allowed supplied property', async () => {
		state.execute.mockResolvedValue([{ property_id: 'p-b' }]);
		const updateTicket = vi.fn();
		const svc = secureServices({ updateTicket }, { updateTicket: maintenancePolicy.updateTicket });
		await expect(
			svc.updateTicket(state.ctx, { id: 'ticket-b', propertyId: 'p-a', title: 'tampered' })
		).rejects.toMatchObject({ status: 404 });
		expect(updateTicket).not.toHaveBeenCalled();
	});
	it('checks nested inspection item identifiers before an edit', async () => {
		state.execute.mockResolvedValue([{ property_id: 'p-b' }]);
		const updateItem = vi.fn();
		const svc = secureServices({ updateItem }, { updateItem: inspectionsPolicy.updateItem });
		await expect(
			svc.updateItem(state.ctx, { id: 'item-b', notes: 'changed' })
		).rejects.toMatchObject({ status: 404 });
		expect(updateItem).not.toHaveBeenCalled();
	});
	it('preserves an authorized property update and forwards the original arguments', async () => {
		const input = { id: 'p-a', name: 'New name' };
		const updateProperty = vi.fn().mockResolvedValue(input);
		const svc = secureServices(
			{ updateProperty },
			{ updateProperty: portfolioPolicy.updateProperty }
		);
		await expect(svc.updateProperty(state.ctx, input)).resolves.toEqual(input);
		expect(updateProperty).toHaveBeenCalledWith(state.ctx, input);
	});
	it('preserves global leasing settings for a leads-only reader', async () => {
		state.ctx.perms = { leads: ['read'] };
		const getLeasingSettings = vi.fn().mockResolvedValue({ timezone: 'UTC' });
		const svc = secureServices(
			{ getLeasingSettings },
			{ getLeasingSettings: crmPolicy.getLeasingSettings }
		);
		await expect(svc.getLeasingSettings('org-a')).resolves.toEqual({ timezone: 'UTC' });
		expect(getLeasingSettings).toHaveBeenCalledOnce();
	});
	it('fails closed if an exported service has no explicit contract', () => {
		expect(() => secureServices({ newPrivateRead: vi.fn() }, {} as never)).toThrow(
			'Missing access contract'
		);
	});
});

describe('authoritative record scope', () => {
	it('rejects missing and unassociated scoped records', async () => {
		state.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([{ property_id: null }]);
		await expect(assertRecordAccess(state.ctx, 'properties', 'unknown')).rejects.toMatchObject({
			status: 404
		});
		await expect(assertRecordAccess(state.ctx, 'tenants', 'unassigned')).rejects.toMatchObject({
			status: 404
		});
	});
	it('rejects a tenant detail containing leases at another property', async () => {
		state.execute.mockResolvedValue([{ property_id: 'p-a' }, { property_id: 'p-b' }]);
		await expect(assertRecordAccess(state.ctx, 'tenants', 'tenant-mixed')).rejects.toMatchObject({
			status: 404
		});
	});
	it('allows scoped readers to see global announcements but denies changing them', async () => {
		state.execute.mockResolvedValue([{ property_id: null }]);
		await expect(assertRecordAccess(state.ctx, 'announcements', 'global')).resolves.toBe(state.ctx);
		await expect(
			assertRecordAccess(state.ctx, 'announcements', 'global', 'write')
		).rejects.toMatchObject({ status: 404 });
	});
	it('checks each relationship rather than trusting the first allowed property', async () => {
		state.execute
			.mockResolvedValueOnce([{ property_id: 'p-a' }])
			.mockResolvedValueOnce([{ property_id: 'p-b' }]);
		await expect(
			assertReferences(state.ctx, { propertyId: 'p-a', unitId: 'unit-b' })
		).rejects.toMatchObject({ status: 404 });
	});
	it('filters lists and does not permit unpublished previews for a forbidden resource', async () => {
		state.execute
			.mockResolvedValueOnce([{ property_id: 'p-a' }])
			.mockResolvedValueOnce([{ property_id: 'p-b' }]);
		await expect(
			filterRecords(state.ctx, 'properties', [{ id: 'p-a' }, { id: 'p-b' }])
		).resolves.toEqual([{ id: 'p-a' }]);
		state.ctx.perms = { tenants: ['read'] };
		await expect(staffOrgForRecord(state.ctx, 'listings', 'listings', 'draft')).resolves.toBeNull();
	});
});

describe('nested resource permissions', () => {
	it('does not disclose leases or tickets through a tenants-only role, even without property scope', async () => {
		state.ctx.propertyIds = null;
		state.ctx.perms = { tenants: ['read'] };
		await expect(
			filterRecords(state.ctx, 'leases', [{ id: 'lease-a', rentAmount: 9000 }])
		).resolves.toEqual([]);
		await expect(
			filterRecords(state.ctx, 'tickets', [{ id: 'ticket-a', title: 'private' }])
		).resolves.toEqual([]);
		expect(state.execute).not.toHaveBeenCalled();
	});
	it('preserves the independently granted nested resource', async () => {
		state.ctx.propertyIds = null;
		state.ctx.perms = { tenants: ['read'], leases: ['read'] };
		await expect(
			filterRecords(state.ctx, 'leases', [{ id: 'lease-a', rentAmount: 9000 }])
		).resolves.toEqual([{ id: 'lease-a', rentAmount: 9000 }]);
	});
	it('requires financial secondary grants before running rich detail services', async () => {
		state.ctx.perms = { owners: ['read'] };
		const ownerReport = vi.fn();
		const { ownersPolicy } = await import('./access-policies.ts');
		const svc = secureServices({ ownerReport }, { ownerReport: ownersPolicy.ownerReport });
		await expect(svc.ownerReport('org-a', 'owner-a')).rejects.toMatchObject({ status: 403 });
		expect(ownerReport).not.toHaveBeenCalled();
	});
	it('rejects portal access by a tenants-only custom role', () => {
		state.ctx.propertyIds = null;
		state.ctx.perms = { tenants: ['read', 'write'] };
		expect(() => assertPortalDelegation(state.ctx)).toThrowError();
	});
	it('rejects scoped portal preview/delegation even when its tenant leases are all assigned', () => {
		state.ctx.perms = null;
		expect(() => assertPortalDelegation(state.ctx)).toThrowError();
	});
	it('preserves full portal access for an ordinary unscoped role', () => {
		state.ctx.propertyIds = null;
		expect(() => assertPortalDelegation(state.ctx)).not.toThrow();
	});
});

describe('owner report delegation', () => {
	it('denies owner contacts-only writers minting full financial report capability', () => {
		state.ctx.propertyIds = null;
		state.ctx.perms = { owners: ['read', 'write'], properties: ['read'] };
		expect(() => assertOwnerDelegation(state.ctx)).toThrowError();
	});
	it('denies property-scoped owner delegation and preserves ordinary full access', () => {
		expect(() => assertOwnerDelegation(state.ctx)).toThrowError();
		state.ctx.propertyIds = null;
		expect(() => assertOwnerDelegation(state.ctx)).not.toThrow();
	});
});
