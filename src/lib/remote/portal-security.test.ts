import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '#lib/server/context.ts';
const state = vi.hoisted(() => ({
	ctx: {} as OrgContext,
	preview: vi.fn(),
	token: vi.fn(),
	tenant: vi.fn(),
	execute: vi.fn(),
	overview: vi.fn()
}));
vi.mock('$app/server', () => ({
	query: (...args: unknown[]) => Object.assign(args.at(-1) as object, { __: { type: 'query' } }),
	command: (...args: unknown[]) => Object.assign(args.at(-1) as object, { __: { type: 'command' } })
}));
vi.mock('#lib/server/context.ts', () => ({
	requireOrg: async () => state.ctx,
	requireUser: () => ({ user: { id: 'linked-user' } })
}));
vi.mock('#lib/server/db/index.ts', () => ({
	db: { execute: state.execute, query: { tenant: { findFirst: state.tenant } } }
}));
vi.mock('#lib/server/services/portal.ts', () => ({
	portalOverview: state.overview,
	portalPreview: state.preview,
	portalToken: state.token,
	portalRequest: vi.fn()
}));
vi.mock('#lib/server/services/online-payments.ts', () => ({ createCheckout: vi.fn() }));
vi.mock('#lib/server/demo-mode.ts', () => ({ assertNotDemo: vi.fn() }));
import { createPortalLink, previewPortal, getPortal } from './portal.remote.ts';
beforeEach(() => {
	state.ctx = { orgId: 'org-a', propertyIds: null, perms: null } as OrgContext;
	vi.clearAllMocks();
	state.execute.mockResolvedValue([{ property_id: 'p-a' }]);
	state.tenant.mockResolvedValue({ id: 'tenant-a' });
	state.preview.mockResolvedValue({
		overview: { leases: [{ rentAmount: 10000 }], tickets: [{ title: 'private' }] }
	});
	state.token.mockReturnValue('signed-capability');
});
describe('manager portal delegation boundary', () => {
	it('denies tenants-only preview before the full portal data is loaded', async () => {
		state.ctx.perms = { tenants: ['read'] };
		await expect(previewPortal('tenant-a')).rejects.toMatchObject({ status: 403 });
		expect(state.preview).not.toHaveBeenCalled();
	});
	it('denies a tenants writer minting a token exposing denied financial/message resources', async () => {
		state.ctx.perms = { tenants: ['read', 'write'] };
		await expect(createPortalLink('tenant-a')).rejects.toMatchObject({ status: 403 });
		expect(state.token).not.toHaveBeenCalled();
	});
	it('denies a scoped preview even if all tenant leases are assigned, since tickets may reference another property', async () => {
		state.ctx.propertyIds = ['p-a'];
		await expect(previewPortal('tenant-a')).rejects.toMatchObject({ status: 403 });
		expect(state.preview).not.toHaveBeenCalled();
	});
	it('preserves an ordinary unscoped manager preview and invite', async () => {
		await expect(previewPortal('tenant-a')).resolves.toMatchObject({
			overview: { leases: [{ rentAmount: 10000 }] }
		});
		await expect(createPortalLink('tenant-a')).resolves.toEqual({
			path: '/portal/claim/signed-capability'
		});
		expect(state.token).toHaveBeenCalledWith('tenant-a');
	});
	it('preserves the authenticated tenant own-portal route', async () => {
		state.ctx.perms = { tenants: [] };
		state.overview.mockResolvedValue({ name: 'Linked tenant' });
		await expect(getPortal()).resolves.toEqual({ name: 'Linked tenant' });
		expect(state.overview).toHaveBeenCalledWith('linked-user');
	});
});
