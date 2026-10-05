import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import {
	lease,
	leaseTenant,
	maintenanceTicket,
	organization,
	property,
	tenant,
	unit
} from '#lib/server/db/schema.ts';
import { emit } from './events.ts';
import { notifyPortalRequest } from './notifications.ts';

const TTL_MS = 14 * 86400_000;

function sign(payload: string) {
	return createHmac('sha256', BETTER_AUTH_SECRET).update(`portal:${payload}`).digest('base64url');
}

/** A signed, expiring link that lets a tenant attach their login to their tenant record. */
export function portalToken(tenantId: string) {
	const payload = `${tenantId}.${Date.now() + TTL_MS}`;
	return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export async function claimPortal(token: string, userId: string) {
	const [encoded, sig] = token.split('.');
	if (!encoded || !sig) error(400, 'Invalid link');
	const payload = Buffer.from(encoded, 'base64url').toString();
	const expected = Buffer.from(sign(payload));
	const given = Buffer.from(sig);
	if (expected.length !== given.length || !timingSafeEqual(expected, given))
		error(400, 'Invalid link');
	const [tenantId, exp] = payload.split('.');
	if (!tenantId || Number(exp) < Date.now())
		error(410, 'This link has expired. Ask your property manager for a new one.');
	const [t] = await db
		.update(tenant)
		.set({ portalUserId: userId })
		.where(eq(tenant.id, tenantId))
		.returning();
	if (!t) error(404, 'Tenant not found');
	return t;
}

export async function portalTenants(userId: string) {
	return db
		.select({ tenant, orgName: organization.name })
		.from(tenant)
		.innerJoin(organization, eq(organization.id, tenant.organizationId))
		.where(eq(tenant.portalUserId, userId));
}

export async function portalOverview(userId: string) {
	const tenants = await portalTenants(userId);
	if (!tenants.length) return null;
	const tenantIds = tenants.map((t) => t.tenant.id);
	const leases = await db
		.select({
			id: lease.id,
			organizationId: lease.organizationId,
			status: lease.status,
			startDate: lease.startDate,
			endDate: lease.endDate,
			rentAmount: lease.rentAmount,
			rentDueDay: lease.rentDueDay,
			currency: lease.currency,
			unitId: unit.id,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name,
			address: sql<string>`concat_ws(', ', nullif(${property.addressLine1}, ''), nullif(${property.city}, ''), nullif(${property.region}, ''))`
		})
		.from(leaseTenant)
		.innerJoin(lease, eq(lease.id, leaseTenant.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(inArray(leaseTenant.tenantId, tenantIds), inArray(lease.status, ['active', 'draft']))
		)
		.orderBy(desc(lease.startDate));

	const { getLease } = await import('./leasing.ts');
	const { payableProviders } = await import('./online-payments.ts');
	const { portalAgreements } = await import('./agreements.ts');
	const { portalInspections } = await import('./inspections.ts');
	const agreements = await portalAgreements(tenantIds);
	const inspections = await portalInspections(tenantIds);
	const payable = await payableProviders([...new Set(leases.map((l) => l.organizationId))]);
	const details = await Promise.all(leases.map((l) => getLease(l.organizationId, l.id)));
	const tickets = await db
		.select({
			id: maintenanceTicket.id,
			number: maintenanceTicket.number,
			title: maintenanceTicket.title,
			status: maintenanceTicket.status,
			createdAt: maintenanceTicket.createdAt
		})
		.from(maintenanceTicket)
		.where(inArray(maintenanceTicket.tenantId, tenantIds))
		.orderBy(desc(maintenanceTicket.createdAt))
		.limit(20);

	return {
		name: tenants[0]!.tenant.firstName || tenants[0]!.tenant.companyName || '',
		orgName: tenants[0]!.orgName,
		leases: leases.map((l, i) => ({
			...l,
			balance: details[i]!.balance,
			payWith: (payable.get(l.organizationId) ?? [])
				.filter((p) => p.supportsCurrency(l.currency))
				.map((p) => ({ id: p.id, label: p.payLabel, newTab: !!p.newTab })),
			charges: details[i]!.charges.slice(0, 12),
			payments: details[i]!.payments.slice(0, 12),
			agreements: agreements.filter((a) => a.leaseId === l.id),
			inspections: inspections.filter((x) => x.leaseId === l.id)
		})),
		tickets
	};
}

export async function portalRequest(
	userId: string,
	input: { leaseId: string; title: string; description?: string | null }
) {
	const tenants = await portalTenants(userId);
	const ids = tenants.map((t) => t.tenant.id);
	if (!ids.length) error(403, 'No tenant account');
	const [row] = await db
		.select({ lease, propertyId: unit.propertyId, tenantId: leaseTenant.tenantId })
		.from(leaseTenant)
		.innerJoin(lease, eq(lease.id, leaseTenant.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.where(and(eq(leaseTenant.leaseId, input.leaseId), inArray(leaseTenant.tenantId, ids)));
	if (!row) error(404, 'Lease not found');
	const orgId = row.lease.organizationId;
	const created = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);
		const [{ n }] = (await tx
			.select({ n: max(maintenanceTicket.number) })
			.from(maintenanceTicket)
			.where(eq(maintenanceTicket.organizationId, orgId))) as [{ n: number | null }];
		const [t] = await tx
			.insert(maintenanceTicket)
			.values({
				organizationId: orgId,
				number: (n ?? 0) + 1,
				propertyId: row.propertyId,
				unitId: row.lease.unitId,
				tenantId: row.tenantId,
				title: input.title,
				description: input.description ?? null
			})
			.returning();
		return t!;
	});
	await emit({
		orgId,
		entityType: 'maintenance',
		entityId: created.id,
		action: 'created',
		summary: `#${created.number} ${created.title} (from tenant portal)`
	});
	const [place] = await db
		.select({ property: property.name, unit: unit.name })
		.from(unit)
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(eq(unit.id, row.lease.unitId));
	void notifyPortalRequest(
		created,
		place ? `${place.property} · ${place.unit}` : 'your property'
	).catch((err) => console.error('portal request email failed', err));
	return created;
}

const MAX_REQUEST_PHOTOS = 10;

/** Lets a tenant attach photos to a request they reported. */
export async function portalRequestPhotos(userId: string, ticketId: string, files: File[]) {
	const ids = (await portalTenants(userId)).map((t) => t.tenant.id);
	if (!ids.length) error(403, 'No tenant account');
	const [t] = await db
		.select({ id: maintenanceTicket.id, orgId: maintenanceTicket.organizationId })
		.from(maintenanceTicket)
		.where(and(eq(maintenanceTicket.id, ticketId), inArray(maintenanceTicket.tenantId, ids)));
	if (!t) error(404, 'Request not found');
	const { IMAGE_TYPE, entityImages, saveDocument } = await import('./documents.ts');
	const images = files.filter((f) => IMAGE_TYPE.test(f.type));
	if (!images.length) error(400, 'Photos must be JPEG, PNG, WebP, GIF or AVIF');
	const existing = await entityImages(t.orgId, 'maintenance', t.id);
	if (existing.length + images.length > MAX_REQUEST_PHOTOS)
		error(400, `You can add up to ${MAX_REQUEST_PHOTOS} photos to a request`);
	for (const f of images) await saveDocument(t.orgId, userId, f, { type: 'maintenance', id: t.id });
	return images.length;
}
