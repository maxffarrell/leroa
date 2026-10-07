import { and, asc, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	amenity,
	amenityBooking,
	packageLog,
	property,
	tenant,
	unit
} from '#lib/server/db/schema.ts';
import { appOrigin, sendEmail } from '#lib/server/email.ts';
import { renderEmail } from '#lib/server/email-template.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { amenityInput, bookingInput, packageInput } from '#lib/schemas.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const fullName = (t: { firstName: string; lastName: string; companyName: string | null }) =>
	`${t.firstName} ${t.lastName}`.trim() || t.companyName || 'Resident';

// ---------- Amenities ----------

export async function listAmenities(orgId: string) {
	return db
		.select({
			id: amenity.id,
			name: amenity.name,
			description: amenity.description,
			openHour: amenity.openHour,
			closeHour: amenity.closeHour,
			slotMinutes: amenity.slotMinutes,
			maxDaysAhead: amenity.maxDaysAhead,
			propertyId: amenity.propertyId,
			propertyName: property.name
		})
		.from(amenity)
		.innerJoin(property, eq(property.id, amenity.propertyId))
		.where(eq(amenity.organizationId, orgId))
		.orderBy(asc(property.name), asc(amenity.name));
}

export async function createAmenity(ctx: OrgContext, input: Out<typeof amenityInput>) {
	const [p] = await db
		.select({ id: property.id })
		.from(property)
		.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, input.propertyId)));
	if (!p) error(404, 'Property not found');
	const [row] = await db
		.insert(amenity)
		.values({ ...input, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'amenity',
		entityId: row!.id,
		action: 'created',
		summary: `Amenity ${row!.name} added`
	});
	return row!;
}

export async function deleteAmenity(ctx: OrgContext, id: string) {
	const [row] = await db
		.delete(amenity)
		.where(and(eq(amenity.organizationId, ctx.orgId), eq(amenity.id, id)))
		.returning({ id: amenity.id });
	if (!row) error(404, 'Amenity not found');
}

/** Confirmed bookings for an amenity between two instants, with tenant names. */
export async function listBookings(orgId: string, amenityId: string, from: Date, to: Date) {
	return db
		.select({
			id: amenityBooking.id,
			startsAt: amenityBooking.startsAt,
			endsAt: amenityBooking.endsAt,
			status: amenityBooking.status,
			notes: amenityBooking.notes,
			tenantId: amenityBooking.tenantId,
			tenantFirst: tenant.firstName,
			tenantLast: tenant.lastName,
			tenantCompany: tenant.companyName
		})
		.from(amenityBooking)
		.leftJoin(tenant, eq(tenant.id, amenityBooking.tenantId))
		.where(
			and(
				eq(amenityBooking.organizationId, orgId),
				eq(amenityBooking.amenityId, amenityId),
				lt(amenityBooking.startsAt, to),
				gt(amenityBooking.endsAt, from)
			)
		)
		.orderBy(asc(amenityBooking.startsAt));
}

/** Books a slot for a tenant; rejects overlaps, past times, and out-of-hours slots. */
export async function bookSlot(ctx: OrgContext, input: Out<typeof bookingInput>) {
	const [a] = await db
		.select()
		.from(amenity)
		.where(and(eq(amenity.organizationId, ctx.orgId), eq(amenity.id, input.amenityId)));
	if (!a) error(404, 'Amenity not found');

	const startsAt = new Date(input.startsAt);
	const endsAt = new Date(startsAt.getTime() + a.slotMinutes * 60_000);
	const now = new Date();
	if (startsAt < now) error(400, 'Pick a time in the future');
	if (startsAt.getTime() - now.getTime() > a.maxDaysAhead * 86_400_000)
		error(400, `Book at most ${a.maxDaysAhead} days ahead`);
	const open = new Date(startsAt);
	open.setHours(a.openHour, 0, 0, 0);
	const close = new Date(startsAt);
	close.setHours(a.closeHour, 0, 0, 0);
	if (startsAt < open || endsAt > close)
		error(400, `Book between ${a.openHour}:00 and ${a.closeHour}:00`);

	if (input.tenantId) {
		const [t] = await db
			.select({ id: tenant.id })
			.from(tenant)
			.where(and(eq(tenant.organizationId, ctx.orgId), eq(tenant.id, input.tenantId)));
		if (!t) error(404, 'Tenant not found');
	}

	const overlap = await db
		.select({ id: amenityBooking.id })
		.from(amenityBooking)
		.where(
			and(
				eq(amenityBooking.amenityId, a.id),
				eq(amenityBooking.status, 'confirmed'),
				lt(amenityBooking.startsAt, endsAt),
				gt(amenityBooking.endsAt, startsAt)
			)
		)
		.limit(1);
	if (overlap.length) error(409, 'That slot is already booked');

	const [row] = await db
		.insert(amenityBooking)
		.values({
			organizationId: ctx.orgId,
			amenityId: a.id,
			tenantId: input.tenantId ?? null,
			startsAt,
			endsAt,
			notes: input.notes ?? null,
			createdBy: ctx.userId
		})
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'amenity',
		entityId: row!.id,
		action: 'booked',
		summary: `${a.name} booked ${startsAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })}`
	});
	return row!;
}

export async function cancelBooking(ctx: OrgContext, id: string) {
	const [row] = await db
		.update(amenityBooking)
		.set({ status: 'cancelled' })
		.where(and(eq(amenityBooking.organizationId, ctx.orgId), eq(amenityBooking.id, id)))
		.returning();
	if (!row) error(404, 'Booking not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'amenity',
		entityId: id,
		action: 'cancelled',
		summary: 'Amenity booking cancelled'
	});
}

// ---------- Packages ----------

export async function listPackages(orgId: string, opts: { includePickedUp?: boolean } = {}) {
	return db
		.select({
			id: packageLog.id,
			status: packageLog.status,
			carrier: packageLog.carrier,
			tracking: packageLog.tracking,
			description: packageLog.description,
			pickedUpAt: packageLog.pickedUpAt,
			notifiedAt: packageLog.notifiedAt,
			createdAt: packageLog.createdAt,
			propertyName: property.name,
			unitName: unit.name,
			tenantId: packageLog.tenantId,
			tenantFirst: tenant.firstName,
			tenantLast: tenant.lastName,
			tenantCompany: tenant.companyName
		})
		.from(packageLog)
		.innerJoin(property, eq(property.id, packageLog.propertyId))
		.leftJoin(unit, eq(unit.id, packageLog.unitId))
		.leftJoin(tenant, eq(tenant.id, packageLog.tenantId))
		.where(
			and(
				eq(packageLog.organizationId, orgId),
				opts.includePickedUp ? undefined : eq(packageLog.status, 'awaiting_pickup')
			)
		)
		.orderBy(desc(packageLog.createdAt))
		.limit(opts.includePickedUp ? 200 : 100);
}

export async function logPackage(ctx: OrgContext, input: Out<typeof packageInput>) {
	const [p] = await db
		.select({ name: property.name })
		.from(property)
		.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, input.propertyId)));
	if (!p) error(404, 'Property not found');
	if (input.unitId) {
		const [u] = await db
			.select({ id: unit.id })
			.from(unit)
			.where(and(eq(unit.propertyId, input.propertyId), eq(unit.id, input.unitId)));
		if (!u) error(404, 'Unit not found');
	}
	let resident: { email: string | null; name: string } | null = null;
	if (input.tenantId) {
		const [t] = await db
			.select()
			.from(tenant)
			.where(and(eq(tenant.organizationId, ctx.orgId), eq(tenant.id, input.tenantId)));
		if (!t) error(404, 'Tenant not found');
		resident = { email: t.email, name: fullName(t) };
	}

	const [row] = await db
		.insert(packageLog)
		.values({
			organizationId: ctx.orgId,
			propertyId: input.propertyId,
			unitId: input.unitId ?? null,
			tenantId: input.tenantId ?? null,
			carrier: input.carrier ?? null,
			tracking: input.tracking ?? null,
			description: input.description ?? null,
			receivedBy: ctx.userId,
			notifiedAt: resident?.email ? new Date() : null
		})
		.returning();

	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'package',
		entityId: row!.id,
		action: 'received',
		summary: `Package received for ${resident?.name ?? 'front desk'} at ${p.name}`
	});

	if (resident?.email) {
		const [u] = input.unitId
			? await db.select({ name: unit.name }).from(unit).where(eq(unit.id, input.unitId))
			: [null];
		const place = u?.name ? `unit ${u.name}` : p.name;
		void sendEmail({
			to: resident.email,
			subject: `A package arrived for you at ${p.name}`,
			...renderEmail({
				orgName: p.name,
				heading: 'Package pickup ready',
				lines: [
					`Hi ${resident.name}, a package${input.carrier ? ` from ${input.carrier}` : ''} was received for ${place}.`,
					'Stop by the office to pick it up.'
				],
				action: { label: 'View your portal', url: `${appOrigin()}/portal` }
			})
		}).catch((err) => console.error('package email failed', err));
	}
	return row!;
}

export async function markPickedUp(ctx: OrgContext, id: string) {
	const [row] = await db
		.update(packageLog)
		.set({ status: 'picked_up', pickedUpAt: new Date() })
		.where(
			and(
				eq(packageLog.organizationId, ctx.orgId),
				eq(packageLog.id, id),
				isNull(packageLog.pickedUpAt)
			)
		)
		.returning();
	if (!row) error(404, 'Package not found or already picked up');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'package',
		entityId: id,
		action: 'picked_up',
		summary: 'Package picked up'
	});
}

/** Dashboard-facing count of packages still waiting for pickup. */
export async function pendingPackageCount(orgId: string) {
	const [r] = await db
		.select({ n: sql<number>`count(*)`.mapWith(Number) })
		.from(packageLog)
		.where(and(eq(packageLog.organizationId, orgId), eq(packageLog.status, 'awaiting_pickup')));
	return r?.n ?? 0;
}
