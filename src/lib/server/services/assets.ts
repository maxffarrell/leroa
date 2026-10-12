import { filterRecords, hasReadAccess } from '#lib/server/access.ts';
import { inArray, and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import { asset, maintenanceTicket, property, unit, vendor } from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { assetInput, assetUpdate } from '#lib/schemas.ts';
import { emit } from './events.ts';
import { assertVendor } from './vendors.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const OPEN = sql`${maintenanceTicket.status} in ('open', 'in_progress', 'on_hold')`;

export async function listAssets(
	orgId: string,
	opts: { propertyId?: string; unitId?: string; includeArchived?: boolean } = {},
	ctx?: OrgContext
) {
	return db
		.select({
			id: asset.id,
			name: asset.name,
			kind: asset.kind,
			make: asset.make,
			model: asset.model,
			serialNumber: asset.serialNumber,
			installedOn: asset.installedOn,
			warrantyExpiresOn: asset.warrantyExpiresOn,
			notes: asset.notes,
			archivedAt: asset.archivedAt,
			propertyId: property.id,
			propertyName: property.name,
			unitId: unit.id,
			unitName: unit.name,
			vendorId: vendor.id,
			vendorName: vendor.name,
			openTickets: sql<number>`count(${maintenanceTicket.id}) filter (where ${OPEN})`.mapWith(
				Number
			),
			jobCount: sql<number>`count(${maintenanceTicket.id})`.mapWith(Number)
		})
		.from(asset)
		.innerJoin(property, eq(property.id, asset.propertyId))
		.leftJoin(unit, eq(unit.id, asset.unitId))
		.leftJoin(vendor, eq(vendor.id, asset.vendorId))
		.leftJoin(
			maintenanceTicket,
			and(
				eq(maintenanceTicket.assetId, asset.id),
				ctx && !hasReadAccess(ctx, 'tickets') ? sql`false` : undefined,
				ctx?.propertyIds ? inArray(maintenanceTicket.propertyId, ctx.propertyIds) : undefined
			)
		)
		.where(
			and(
				eq(asset.organizationId, orgId),
				opts.propertyId ? eq(asset.propertyId, opts.propertyId) : undefined,
				opts.unitId ? eq(asset.unitId, opts.unitId) : undefined,
				opts.includeArchived ? undefined : isNull(asset.archivedAt)
			)
		)
		.groupBy(asset.id, property.id, unit.id, vendor.id)
		.orderBy(asc(asset.name));
}

export type AssetRow = Awaited<ReturnType<typeof listAssets>>[number];

async function assetInOrg(orgId: string, id: string) {
	const [row] = await db
		.select()
		.from(asset)
		.where(and(eq(asset.organizationId, orgId), eq(asset.id, id)));
	if (!row) error(404, 'Asset not found');
	return row;
}

/** An asset with its service history — every work order logged against it. */
export async function getAsset(orgId: string, id: string, ctx?: OrgContext) {
	const row = await assetInOrg(orgId, id);
	const [history, p, u, v] = await Promise.all([
		db
			.select({
				id: maintenanceTicket.id,
				number: maintenanceTicket.number,
				title: maintenanceTicket.title,
				status: maintenanceTicket.status,
				priority: maintenanceTicket.priority,
				costAmount: maintenanceTicket.costAmount,
				dueDate: maintenanceTicket.dueDate,
				closedAt: maintenanceTicket.closedAt,
				createdAt: maintenanceTicket.createdAt
			})
			.from(maintenanceTicket)
			.where(and(eq(maintenanceTicket.organizationId, orgId), eq(maintenanceTicket.assetId, id)))
			.orderBy(desc(maintenanceTicket.createdAt))
			.limit(200),
		db
			.select({ id: property.id, name: property.name })
			.from(property)
			.where(eq(property.id, row.propertyId)),
		row.unitId
			? db.select({ id: unit.id, name: unit.name }).from(unit).where(eq(unit.id, row.unitId))
			: [],
		row.vendorId
			? db
					.select({ id: vendor.id, name: vendor.name })
					.from(vendor)
					.where(eq(vendor.id, row.vendorId))
			: []
	]);
	return {
		...row,
		history: ctx ? await filterRecords(ctx, 'tickets', history) : history,
		property: p[0] ?? null,
		unit: u[0] ?? null,
		vendor: v[0] ?? null
	};
}

/** Throws unless the asset exists in this workspace. */
export async function assertAsset(orgId: string, id: string) {
	return assetInOrg(orgId, id);
}

/** Checks that an optional unit/unit+property pairing is consistent. */
async function assertUnit(orgId: string, unitId: string, propertyId: string) {
	const [u] = await db
		.select({ propertyId: unit.propertyId })
		.from(unit)
		.where(and(eq(unit.organizationId, orgId), eq(unit.id, unitId)));
	if (!u) error(404, 'Unit not found');
	if (u.propertyId !== propertyId) error(400, 'That unit is not in the selected property');
	return u;
}

export async function createAsset(ctx: OrgContext, input: Out<typeof assetInput>) {
	const [p] = await db
		.select({ id: property.id })
		.from(property)
		.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, input.propertyId)));
	if (!p) error(404, 'Property not found');
	if (input.unitId) await assertUnit(ctx.orgId, input.unitId, input.propertyId);
	if (input.vendorId) await assertVendor(ctx.orgId, input.vendorId);
	const [row] = await db
		.insert(asset)
		.values({ ...input, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'asset',
		entityId: row!.id,
		action: 'created',
		summary: `Added asset ${row!.name}`
	});
	return row!;
}

export async function updateAsset(
	ctx: OrgContext,
	{ id, archived, ...data }: Out<typeof assetUpdate>
) {
	const before = await assetInOrg(ctx.orgId, id);
	if (data.unitId) await assertUnit(ctx.orgId, data.unitId, before.propertyId);
	if (data.vendorId) await assertVendor(ctx.orgId, data.vendorId);
	const [row] = await db
		.update(asset)
		.set({
			...data,
			...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null })
		})
		.where(and(eq(asset.organizationId, ctx.orgId), eq(asset.id, id)))
		.returning();
	if (!row) error(404, 'Asset not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'asset',
		entityId: id,
		action: 'updated',
		summary:
			archived === undefined
				? `Updated asset ${row.name}`
				: `${archived ? 'Archived' : 'Restored'} asset ${row.name}`
	});
	return row;
}
