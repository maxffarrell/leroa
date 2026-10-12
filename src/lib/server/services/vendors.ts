import { filterRecords, hasReadAccess } from '#lib/server/access.ts';
import { inArray, and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import { maintenanceTicket, property, unit, vendor } from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { vendorInput, vendorUpdate } from '#lib/schemas.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const OPEN = sql`${maintenanceTicket.status} in ('open', 'in_progress', 'on_hold')`;

export async function listVendors(
	orgId: string,
	opts: { includeArchived?: boolean } = {},
	ctx?: OrgContext
) {
	const yearStart = `${new Date().getUTCFullYear()}-01-01`;
	return db
		.select({
			id: vendor.id,
			name: vendor.name,
			contactName: vendor.contactName,
			email: vendor.email,
			phone: vendor.phone,
			trades: vendor.trades,
			insuranceExpiresOn: vendor.insuranceExpiresOn,
			archivedAt: vendor.archivedAt,
			openCount: sql<number>`count(${maintenanceTicket.id}) filter (where ${OPEN})`.mapWith(Number),
			jobCount: sql<number>`count(${maintenanceTicket.id})`.mapWith(Number),
			spendYtd:
				sql<number>`coalesce(sum(${maintenanceTicket.costAmount}) filter (where ${maintenanceTicket.status} = 'done' and ${maintenanceTicket.closedAt} >= ${yearStart}::date), 0)`.mapWith(
					Number
				),
			lastJobAt: sql<string | null>`max(${maintenanceTicket.createdAt})`
		})
		.from(vendor)
		.leftJoin(
			maintenanceTicket,
			and(
				eq(maintenanceTicket.vendorId, vendor.id),
				ctx && !hasReadAccess(ctx, 'tickets') ? sql`false` : undefined,
				ctx?.propertyIds ? inArray(maintenanceTicket.propertyId, ctx.propertyIds) : undefined
			)
		)
		.where(
			and(
				eq(vendor.organizationId, orgId),
				opts.includeArchived ? undefined : isNull(vendor.archivedAt)
			)
		)
		.groupBy(vendor.id)
		.orderBy(asc(vendor.name));
}

export type VendorRow = Awaited<ReturnType<typeof listVendors>>[number];

export async function getVendor(orgId: string, id: string, ctx?: OrgContext) {
	const [row] = await db
		.select()
		.from(vendor)
		.where(and(eq(vendor.organizationId, orgId), eq(vendor.id, id)));
	if (!row) error(404, 'Vendor not found');
	const jobs = await db
		.select({
			id: maintenanceTicket.id,
			number: maintenanceTicket.number,
			title: maintenanceTicket.title,
			status: maintenanceTicket.status,
			priority: maintenanceTicket.priority,
			costAmount: maintenanceTicket.costAmount,
			createdAt: maintenanceTicket.createdAt,
			closedAt: maintenanceTicket.closedAt,
			propertyName: property.name,
			unitName: unit.name
		})
		.from(maintenanceTicket)
		.innerJoin(property, eq(property.id, maintenanceTicket.propertyId))
		.leftJoin(unit, eq(unit.id, maintenanceTicket.unitId))
		.where(and(eq(maintenanceTicket.organizationId, orgId), eq(maintenanceTicket.vendorId, id)))
		.orderBy(desc(maintenanceTicket.createdAt))
		.limit(200);
	return { ...row, jobs: ctx ? await filterRecords(ctx, 'tickets', jobs) : jobs };
}

const clean = (data: Partial<Out<typeof vendorInput>>) => ({
	...data,
	...(data.email !== undefined ? { email: data.email || null } : {}),
	...(data.trades ? { trades: [...new Set(data.trades)] } : {})
});

export async function createVendor(ctx: OrgContext, input: Out<typeof vendorInput>) {
	const [row] = await db
		.insert(vendor)
		.values({ ...input, ...clean(input), name: input.name, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'vendor',
		entityId: row!.id,
		action: 'created',
		summary: `Added vendor ${row!.name}`
	});
	return row!;
}

export async function updateVendor(
	ctx: OrgContext,
	{ id, archived, ...data }: Out<typeof vendorUpdate>
) {
	const [row] = await db
		.update(vendor)
		.set({
			...clean(data),
			...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null })
		})
		.where(and(eq(vendor.organizationId, ctx.orgId), eq(vendor.id, id)))
		.returning();
	if (!row) error(404, 'Vendor not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'vendor',
		entityId: id,
		action: 'updated',
		summary:
			archived === undefined
				? `Updated vendor ${row.name}`
				: `${archived ? 'Archived' : 'Restored'} vendor ${row.name}`
	});
	return row;
}

/** Throws unless the vendor exists in this workspace. */
export async function assertVendor(orgId: string, id: string) {
	const [row] = await db
		.select({ id: vendor.id, archivedAt: vendor.archivedAt })
		.from(vendor)
		.where(and(eq(vendor.organizationId, orgId), eq(vendor.id, id)));
	if (!row) error(404, 'Vendor not found');
	return row;
}
