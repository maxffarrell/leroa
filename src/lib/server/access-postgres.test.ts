import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { OrgContext } from './context.ts';
vi.mock('$app/env/private', () => ({
	DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost/unavailable'
}));
vi.mock('./context.ts', () => ({ requireOrg: vi.fn(), requirePerm: vi.fn() }));
import { db } from './db/index.ts';
import {
	organization,
	property,
	unit,
	tenant,
	lease,
	leaseTenant,
	charge,
	payment,
	maintenanceTicket
} from './db/schema.ts';
import { canAccessRecord, assertRecordAccess, type RecordEntity } from './access.ts';

const orgs = [randomUUID(), randomUUID()];
const properties = Array.from({ length: 3 }, () => randomUUID());
const units = Array.from({ length: 3 }, () => randomUUID());
const tenants = Array.from({ length: 4 }, () => randomUUID());
const leases = Array.from({ length: 4 }, () => randomUUID());
const charges = Array.from({ length: 3 }, () => randomUUID());
const payments = Array.from({ length: 3 }, () => randomUUID());
const tickets = Array.from({ length: 3 }, () => randomUUID());
const ctx: OrgContext = {
	orgId: orgs[0],
	userId: 'resolver-test',
	memberId: 'resolver-test',
	role: 'member',
	org: {
		id: orgs[0],
		name: 'Test',
		slug: orgs[0],
		logo: null,
		accentColor: null,
		portalTitle: null
	},
	perms: null,
	propertyIds: [properties[0]]
};
const orgFor = (i: number) => orgs[i === 2 ? 1 : 0];

describe.runIf(Boolean(process.env.DATABASE_URL))(
	'authoritative property resolution in migrated Postgres',
	() => {
		beforeAll(async () => {
			await db
				.insert(organization)
				.values(orgs.map((id) => ({ id, name: 'Resolver test', slug: id, createdAt: new Date() })));
			await db
				.insert(property)
				.values(
					properties.map((id, i) => ({ id, organizationId: orgFor(i), name: `Property ${i}` }))
				);
			await db.insert(unit).values(
				units.map((id, i) => ({
					id,
					organizationId: orgFor(i),
					propertyId: properties[i],
					name: 'Unit'
				}))
			);
			await db
				.insert(tenant)
				.values(tenants.map((id, i) => ({ id, organizationId: orgFor(i), firstName: 'Tenant' })));
			await db.insert(lease).values(
				leases.map((id, i) => ({
					id,
					organizationId: orgFor(i),
					unitId: units[i === 3 ? 2 : i],
					startDate: '2026-01-01',
					rentAmount: 1000
				}))
			);
			await db
				.insert(leaseTenant)
				.values(tenants.slice(0, 3).map((tenantId, i) => ({ tenantId, leaseId: leases[i] })));
			await db.insert(charge).values(
				charges.map((id, i) => ({
					id,
					organizationId: orgFor(i),
					leaseId: leases[i],
					amount: 1000,
					dueDate: '2026-01-01'
				}))
			);
			await db.insert(payment).values(
				payments.map((id, i) => ({
					id,
					organizationId: orgFor(i),
					leaseId: leases[i],
					chargeId: charges[i],
					amount: 100,
					receivedOn: '2026-01-01'
				}))
			);
			await db.insert(maintenanceTicket).values(
				tickets.map((id, i) => ({
					id,
					organizationId: orgFor(i),
					propertyId: properties[i],
					number: i + 1,
					title: 'Ticket'
				}))
			);
		});
		afterAll(async () => {
			await db.delete(lease).where(inArray(lease.id, leases));
			await db.delete(organization).where(inArray(organization.id, orgs));
		});
		const cases: [RecordEntity, string[]][] = [
			['properties', properties],
			['units', units],
			['tenants', tenants],
			['leases', leases],
			['charges', charges],
			['payments', payments],
			['tickets', tickets]
		];
		it.each(cases)(
			'%s permits assigned records and rejects unassigned or foreign records',
			async (resource, ids) => {
				await expect(assertRecordAccess(ctx, resource, ids[0])).resolves.toBe(ctx);
				await expect(assertRecordAccess(ctx, resource, ids[1])).rejects.toMatchObject({
					status: 404
				});
				await expect(assertRecordAccess(ctx, resource, ids[2])).rejects.toMatchObject({
					status: 404
				});
				expect(await canAccessRecord({ ...ctx, propertyIds: null }, resource, ids[1])).toBe(true);
				expect(await canAccessRecord({ ...ctx, propertyIds: null }, resource, ids[2])).toBe(false);
			}
		);
		it('rejects unassociated tenants and historical cross-organization lease references', async () => {
			expect(await canAccessRecord(ctx, 'tenants', tenants[3])).toBe(false);
			expect(await canAccessRecord(ctx, 'leases', leases[3])).toBe(false);
			expect(await canAccessRecord({ ...ctx, propertyIds: null }, 'leases', leases[3])).toBe(false);
		});
		it('rejects a tenant whose associations include another assigned boundary', async () => {
			await db.insert(leaseTenant).values({ tenantId: tenants[0], leaseId: leases[1] });
			expect(await canAccessRecord(ctx, 'tenants', tenants[0])).toBe(false);
			expect(await canAccessRecord({ ...ctx, propertyIds: null }, 'tenants', tenants[0])).toBe(
				true
			);
			await db.delete(leaseTenant).where(eq(leaseTenant.tenantId, tenants[0]));
		});
	}
);
