import { filterRecords } from '#lib/server/access.ts';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	lease,
	leaseTenant,
	maintenanceTicket,
	property,
	tenant,
	unit
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type {
	propertyCreate,
	propertyUpdate,
	tenantInput,
	tenantUpdate,
	unitInput,
	unitUpdate
} from '#lib/schemas.ts';
import { tenantName } from '#lib/format.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

export async function listProperties(orgId: string) {
	const unitStats = db
		.select({
			propertyId: unit.propertyId,
			units: count().as('units'),
			occupied: sql<number>`count(*) filter (where ${unit.status} = 'occupied')`
				.mapWith(Number)
				.as('occupied'),
			marketRent: sql<number>`coalesce(sum(${unit.marketRent}), 0)`
				.mapWith(Number)
				.as('market_rent')
		})
		.from(unit)
		.where(eq(unit.organizationId, orgId))
		.groupBy(unit.propertyId)
		.as('unit_stats');

	const openTickets = db
		.select({ propertyId: maintenanceTicket.propertyId, open: count().as('open') })
		.from(maintenanceTicket)
		.where(
			and(
				eq(maintenanceTicket.organizationId, orgId),
				inArray(maintenanceTicket.status, ['open', 'in_progress', 'on_hold'])
			)
		)
		.groupBy(maintenanceTicket.propertyId)
		.as('open_tickets');

	return db
		.select({
			id: property.id,
			name: property.name,
			type: property.type,
			addressLine1: property.addressLine1,
			city: property.city,
			region: property.region,
			units: sql<number>`coalesce(${unitStats.units}, 0)`.mapWith(Number),
			occupied: sql<number>`coalesce(${unitStats.occupied}, 0)`.mapWith(Number),
			marketRent: sql<number>`coalesce(${unitStats.marketRent}, 0)`.mapWith(Number),
			openTickets: sql<number>`coalesce(${openTickets.open}, 0)`.mapWith(Number)
		})
		.from(property)
		.leftJoin(unitStats, eq(unitStats.propertyId, property.id))
		.leftJoin(openTickets, eq(openTickets.propertyId, property.id))
		.where(and(eq(property.organizationId, orgId), isNull(property.archivedAt)))
		.orderBy(asc(property.name));
}

export async function getProperty(orgId: string, id: string) {
	const row = await db.query.property.findFirst({
		where: (p, { and, eq }) => and(eq(p.organizationId, orgId), eq(p.id, id))
	});
	if (!row) error(404, 'Property not found');

	const units = await db
		.select({
			id: unit.id,
			name: unit.name,
			bedrooms: unit.bedrooms,
			bathrooms: unit.bathrooms,
			areaSqft: unit.areaSqft,
			marketRent: unit.marketRent,
			status: unit.status,
			leaseId: lease.id,
			leaseRent: lease.rentAmount,
			leaseEnd: lease.endDate
		})
		.from(unit)
		.leftJoin(
			lease,
			and(
				eq(lease.unitId, unit.id),
				eq(lease.status, 'active'),
				// The current lease: skip renewals that haven't started and leases a started renewal replaced.
				sql`not (${lease.renewedFromId} is not null and ${lease.startDate} > current_date)`,
				sql`not exists (select 1 from ${lease} r where r.renewed_from_id = ${lease.id} and r.status = 'active' and r.start_date <= current_date)`
			)
		)
		.where(and(eq(unit.organizationId, orgId), eq(unit.propertyId, id)))
		.orderBy(sql`length(${unit.name})`, asc(unit.name));

	return { ...row, units };
}

export async function createProperty(ctx: OrgContext, input: Out<typeof propertyCreate>) {
	const { units: unitNames, ...data } = input;
	const created = await db.transaction(async (tx) => {
		const [p] = await tx
			.insert(property)
			.values({ ...data, organizationId: ctx.orgId })
			.returning();
		if (unitNames.length) {
			const unique = [...new Set(unitNames)];
			await tx
				.insert(unit)
				.values(unique.map((name) => ({ name, propertyId: p!.id, organizationId: ctx.orgId })));
		}
		return p!;
	});
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'property',
		entityId: created.id,
		action: 'created',
		summary: `Added property ${created.name}`
	});
	return created;
}

export async function updateProperty(ctx: OrgContext, { id, ...data }: Out<typeof propertyUpdate>) {
	const [p] = await db
		.update(property)
		.set(data)
		.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, id)))
		.returning();
	if (!p) error(404, 'Property not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'property',
		entityId: id,
		action: 'updated',
		summary: `Updated ${p.name}`
	});
	return p;
}

export async function archiveProperty(ctx: OrgContext, id: string) {
	const [p] = await db
		.update(property)
		.set({ archivedAt: new Date() })
		.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, id)))
		.returning();
	if (!p) error(404, 'Property not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'property',
		entityId: id,
		action: 'deleted',
		summary: `Archived ${p.name}`
	});
}

export async function listUnits(orgId: string, opts: { vacantOnly?: boolean } = {}) {
	return db
		.select({
			id: unit.id,
			name: unit.name,
			status: unit.status,
			marketRent: unit.marketRent,
			propertyId: property.id,
			propertyName: property.name
		})
		.from(unit)
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(
				eq(unit.organizationId, orgId),
				isNull(property.archivedAt),
				opts.vacantOnly ? inArray(unit.status, ['vacant', 'notice']) : undefined
			)
		)
		.orderBy(asc(property.name), sql`length(${unit.name})`, asc(unit.name));
}

export async function createUnit(ctx: OrgContext, input: Out<typeof unitInput>) {
	const p = await db.query.property.findFirst({
		where: (p, { and, eq }) => and(eq(p.organizationId, ctx.orgId), eq(p.id, input.propertyId))
	});
	if (!p) error(404, 'Property not found');
	const [u] = await db
		.insert(unit)
		.values({ ...input, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'unit',
		entityId: u!.id,
		action: 'created',
		summary: `Added unit ${u!.name} to ${p.name}`
	});
	return u!;
}

export async function updateUnit(ctx: OrgContext, { id, ...data }: Out<typeof unitUpdate>) {
	const [u] = await db
		.update(unit)
		.set(data)
		.where(and(eq(unit.organizationId, ctx.orgId), eq(unit.id, id)))
		.returning();
	if (!u) error(404, 'Unit not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'unit',
		entityId: id,
		action: 'updated',
		summary: `Updated unit ${u.name}`
	});
	return u;
}

export async function deleteUnit(ctx: OrgContext, id: string) {
	const [{ n }] = (await db.select({ n: count() }).from(lease).where(eq(lease.unitId, id))) as [
		{ n: number }
	];
	if (n > 0) error(409, 'This unit has leases. End them before removing the unit.');
	await db.delete(unit).where(and(eq(unit.organizationId, ctx.orgId), eq(unit.id, id)));
}

export async function listTenants(orgId: string, q?: string) {
	const search = q?.trim();
	const activeLease = db
		.select({
			tenantId: leaseTenant.tenantId,
			leaseId: sql<string>`(array_agg(${lease.id} order by ${lease.startDate} desc))[1]`.as(
				'lease_id'
			),
			unitId: sql<string>`(array_agg(${lease.unitId} order by ${lease.startDate} desc))[1]`.as(
				'unit_id'
			)
		})
		.from(leaseTenant)
		.innerJoin(lease, and(eq(lease.id, leaseTenant.leaseId), eq(lease.status, 'active')))
		.groupBy(leaseTenant.tenantId)
		.as('active_lease');

	return db
		.select({
			id: tenant.id,
			kind: tenant.kind,
			firstName: tenant.firstName,
			lastName: tenant.lastName,
			companyName: tenant.companyName,
			email: tenant.email,
			phone: tenant.phone,
			leaseId: activeLease.leaseId,
			unitName: unit.name,
			propertyName: property.name,
			createdAt: tenant.createdAt
		})
		.from(tenant)
		.leftJoin(activeLease, eq(activeLease.tenantId, tenant.id))
		.leftJoin(unit, eq(unit.id, activeLease.unitId))
		.leftJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(
				eq(tenant.organizationId, orgId),
				search
					? or(
							ilike(tenant.firstName, `%${search}%`),
							ilike(tenant.lastName, `%${search}%`),
							ilike(tenant.companyName, `%${search}%`),
							ilike(tenant.email, `%${search}%`)
						)
					: undefined
			)
		)
		.orderBy(asc(tenant.lastName), asc(tenant.firstName));
}

export async function getTenant(orgId: string, id: string, ctx?: OrgContext) {
	const t = await db.query.tenant.findFirst({
		where: (t, { and, eq }) => and(eq(t.organizationId, orgId), eq(t.id, id))
	});
	if (!t) error(404, 'Tenant not found');
	const leases = await db
		.select({
			id: lease.id,
			status: lease.status,
			startDate: lease.startDate,
			endDate: lease.endDate,
			rentAmount: lease.rentAmount,
			currency: lease.currency,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name
		})
		.from(leaseTenant)
		.innerJoin(lease, eq(lease.id, leaseTenant.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(eq(leaseTenant.tenantId, id))
		.orderBy(desc(lease.startDate));
	const tickets = await db
		.select({
			id: maintenanceTicket.id,
			number: maintenanceTicket.number,
			title: maintenanceTicket.title,
			status: maintenanceTicket.status,
			createdAt: maintenanceTicket.createdAt
		})
		.from(maintenanceTicket)
		.where(and(eq(maintenanceTicket.organizationId, orgId), eq(maintenanceTicket.tenantId, id)))
		.orderBy(desc(maintenanceTicket.createdAt))
		.limit(20);
	return {
		...t,
		leases: ctx ? await filterRecords(ctx, 'leases', leases) : leases,
		tickets: ctx ? await filterRecords(ctx, 'tickets', tickets) : tickets
	};
}

export async function createTenant(ctx: OrgContext, input: Out<typeof tenantInput>) {
	if (!input.firstName && !input.lastName && !input.companyName) error(400, 'Enter a name');
	const [t] = await db
		.insert(tenant)
		.values({ ...input, email: input.email || null, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'tenant',
		entityId: t!.id,
		action: 'created',
		summary: `Added tenant ${tenantName(t!)}`
	});
	return t!;
}

export async function updateTenant(ctx: OrgContext, { id, ...data }: Out<typeof tenantUpdate>) {
	const [t] = await db
		.update(tenant)
		.set({ ...data, ...(data.email !== undefined ? { email: data.email || null } : {}) })
		.where(and(eq(tenant.organizationId, ctx.orgId), eq(tenant.id, id)))
		.returning();
	if (!t) error(404, 'Tenant not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'tenant',
		entityId: id,
		action: 'updated',
		summary: `Updated ${tenantName(t)}`
	});
	return t;
}

export async function deleteTenant(ctx: OrgContext, id: string) {
	const [{ n }] = (await db
		.select({ n: count() })
		.from(leaseTenant)
		.where(eq(leaseTenant.tenantId, id))) as [{ n: number }];
	if (n > 0) error(409, 'This tenant is on a lease and can’t be deleted.');
	await db.delete(tenant).where(and(eq(tenant.organizationId, ctx.orgId), eq(tenant.id, id)));
}
