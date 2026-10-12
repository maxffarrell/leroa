import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '#lib/server/context.ts';
const state = vi.hoisted(() => ({ tenant: vi.fn(), select: vi.fn(), execute: vi.fn() }));
vi.mock('#lib/server/db/index.ts', () => ({
	db: {
		query: { tenant: { findFirst: state.tenant } },
		select: state.select,
		execute: state.execute
	}
}));
vi.mock('./events.ts', () => ({ emit: vi.fn() }));
vi.mock('#lib/server/context.ts', () => ({ requireOrg: vi.fn(), requirePerm: vi.fn() }));
import { getTenant } from './portfolio.ts';
function rows(value: unknown[]) {
	const query: Record<string, unknown> = {
		then: (resolve: (v: unknown[]) => unknown) => Promise.resolve(value).then(resolve)
	};
	for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit'])
		query[method] = () => query;
	return query;
}
beforeEach(() => {
	vi.clearAllMocks();
	state.tenant.mockResolvedValue({ id: 'tenant-a', firstName: 'Ada' });
	state.select
		.mockReturnValueOnce(rows([{ id: 'lease-a', rentAmount: 9000 }]))
		.mockReturnValueOnce(rows([{ id: 'ticket-a', title: 'private repair' }]));
});
describe('tenant detail resource projection', () => {
	it('returns basic tenant data without leaking denied lease rent or ticket titles', async () => {
		const ctx = { orgId: 'org-a', propertyIds: null, perms: { tenants: ['read'] } } as OrgContext;
		await expect(getTenant('org-a', 'tenant-a', ctx)).resolves.toEqual({
			id: 'tenant-a',
			firstName: 'Ada',
			leases: [],
			tickets: []
		});
	});
	it('preserves rich tenant details for ordinary roles', async () => {
		const ctx = { orgId: 'org-a', propertyIds: null, perms: null } as OrgContext;
		await expect(getTenant('org-a', 'tenant-a', ctx)).resolves.toMatchObject({
			leases: [{ rentAmount: 9000 }],
			tickets: [{ title: 'private repair' }]
		});
	});
});
