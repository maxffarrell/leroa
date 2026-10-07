import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	amenity,
	amenityBooking,
	communityEvent,
	guestPass,
	keyRecord,
	lease,
	leaseTenant,
	packageLog,
	parkingPermit,
	property,
	survey,
	surveyResponse,
	tenant,
	unit
} from '#lib/server/db/schema.ts';
import { appOrigin, sendEmail } from '#lib/server/email.ts';
import { renderEmail } from '#lib/server/email-template.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type {
	amenityInput,
	bookingInput,
	eventInput,
	keyInput,
	packageInput,
	passInput,
	permitInput,
	surveyInput,
	surveyResponseInput
} from '#lib/schemas.ts';
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

/** Shared property/unit/tenant validation for resident-life records. */
async function checkResidentPlace(
	orgId: string,
	propertyId: string,
	unitId: string | null | undefined,
	tenantId: string | null | undefined
) {
	const [p] = await db
		.select({ name: property.name })
		.from(property)
		.where(and(eq(property.organizationId, orgId), eq(property.id, propertyId)));
	if (!p) error(404, 'Property not found');
	if (unitId) {
		const [u] = await db
			.select({ id: unit.id })
			.from(unit)
			.where(and(eq(unit.propertyId, propertyId), eq(unit.id, unitId)));
		if (!u) error(404, 'Unit not found');
	}
	let resident: { name: string } | null = null;
	if (tenantId) {
		const [t] = await db
			.select()
			.from(tenant)
			.where(and(eq(tenant.organizationId, orgId), eq(tenant.id, tenantId)));
		if (!t) error(404, 'Tenant not found');
		resident = { name: fullName(t) };
	}
	return { propertyName: p.name, residentName: resident?.name ?? null };
}

// ---------- Parking permits ----------

const PERMIT_SELECT = {
	id: parkingPermit.id,
	status: parkingPermit.status,
	permitNumber: parkingPermit.permitNumber,
	vehicle: parkingPermit.vehicle,
	expiresOn: parkingPermit.expiresOn,
	notes: parkingPermit.notes,
	createdAt: parkingPermit.createdAt,
	propertyName: property.name,
	unitName: unit.name,
	tenantId: parkingPermit.tenantId,
	tenantFirst: tenant.firstName,
	tenantLast: tenant.lastName,
	tenantCompany: tenant.companyName
} as const;

export async function listPermits(orgId: string, opts: { includeRevoked?: boolean } = {}) {
	return db
		.select(PERMIT_SELECT)
		.from(parkingPermit)
		.innerJoin(property, eq(property.id, parkingPermit.propertyId))
		.leftJoin(unit, eq(unit.id, parkingPermit.unitId))
		.leftJoin(tenant, eq(tenant.id, parkingPermit.tenantId))
		.where(
			and(
				eq(parkingPermit.organizationId, orgId),
				opts.includeRevoked ? undefined : eq(parkingPermit.status, 'active')
			)
		)
		.orderBy(desc(parkingPermit.createdAt))
		.limit(200);
}

export async function issuePermit(ctx: OrgContext, input: Out<typeof permitInput>) {
	const { residentName } = await checkResidentPlace(
		ctx.orgId,
		input.propertyId,
		input.unitId,
		input.tenantId
	);
	const [row] = await db
		.insert(parkingPermit)
		.values({ ...input, organizationId: ctx.orgId })
		.returning()
		.catch((e) => {
			if ((e as { cause?: { code?: string } })?.cause?.code === '23505')
				error(409, 'That permit number is already in use at this property');
			throw e;
		});
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'permit',
		entityId: row!.id,
		action: 'issued',
		summary: `Permit ${row!.permitNumber} issued${residentName ? ` to ${residentName}` : ''}`
	});
	return row!;
}

export async function revokePermit(ctx: OrgContext, id: string) {
	const [row] = await db
		.update(parkingPermit)
		.set({ status: 'revoked' })
		.where(
			and(
				eq(parkingPermit.organizationId, ctx.orgId),
				eq(parkingPermit.id, id),
				eq(parkingPermit.status, 'active')
			)
		)
		.returning();
	if (!row) error(404, 'Permit not found or already revoked');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'permit',
		entityId: id,
		action: 'revoked',
		summary: `Permit ${row.permitNumber} revoked`
	});
}

// ---------- Keys & fobs ----------

export async function listKeys(orgId: string, opts: { includeClosed?: boolean } = {}) {
	return db
		.select({
			id: keyRecord.id,
			status: keyRecord.status,
			kind: keyRecord.kind,
			label: keyRecord.label,
			issuedAt: keyRecord.issuedAt,
			closedAt: keyRecord.closedAt,
			notes: keyRecord.notes,
			propertyName: property.name,
			unitName: unit.name,
			tenantFirst: tenant.firstName,
			tenantLast: tenant.lastName,
			tenantCompany: tenant.companyName
		})
		.from(keyRecord)
		.innerJoin(property, eq(property.id, keyRecord.propertyId))
		.leftJoin(unit, eq(unit.id, keyRecord.unitId))
		.leftJoin(tenant, eq(tenant.id, keyRecord.tenantId))
		.where(
			and(
				eq(keyRecord.organizationId, orgId),
				opts.includeClosed ? undefined : eq(keyRecord.status, 'issued')
			)
		)
		.orderBy(desc(keyRecord.createdAt))
		.limit(200);
}

export async function issueKey(ctx: OrgContext, input: Out<typeof keyInput>) {
	const { residentName } = await checkResidentPlace(
		ctx.orgId,
		input.propertyId,
		input.unitId,
		input.tenantId
	);
	const [row] = await db
		.insert(keyRecord)
		.values({ ...input, organizationId: ctx.orgId, issuedAt: new Date() })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'key_record',
		entityId: row!.id,
		action: 'issued',
		summary: `${input.kind} ${input.label} issued${residentName ? ` to ${residentName}` : ''}`
	});
	return row!;
}

export async function closeKey(ctx: OrgContext, id: string, status: 'returned' | 'lost') {
	const [row] = await db
		.update(keyRecord)
		.set({ status, closedAt: new Date() })
		.where(
			and(
				eq(keyRecord.organizationId, ctx.orgId),
				eq(keyRecord.id, id),
				eq(keyRecord.status, 'issued')
			)
		)
		.returning();
	if (!row) error(404, 'Key not found or already closed');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'key_record',
		entityId: id,
		action: status,
		summary: `${row.kind} ${row.label} ${status}`
	});
}

// ---------- Guest passes ----------

export async function listPasses(orgId: string, opts: { includeVoid?: boolean } = {}) {
	return db
		.select({
			id: guestPass.id,
			status: guestPass.status,
			guestName: guestPass.guestName,
			startsOn: guestPass.startsOn,
			endsOn: guestPass.endsOn,
			notes: guestPass.notes,
			propertyName: property.name,
			unitName: unit.name,
			tenantFirst: tenant.firstName,
			tenantLast: tenant.lastName,
			tenantCompany: tenant.companyName
		})
		.from(guestPass)
		.innerJoin(property, eq(property.id, guestPass.propertyId))
		.leftJoin(unit, eq(unit.id, guestPass.unitId))
		.leftJoin(tenant, eq(tenant.id, guestPass.tenantId))
		.where(
			and(
				eq(guestPass.organizationId, orgId),
				opts.includeVoid ? undefined : eq(guestPass.status, 'active')
			)
		)
		.orderBy(asc(guestPass.endsOn))
		.limit(200);
}

export async function createPass(ctx: OrgContext, input: Out<typeof passInput>) {
	if (input.endsOn < input.startsOn) error(400, 'Ends before it starts');
	const { propertyName, residentName } = await checkResidentPlace(
		ctx.orgId,
		input.propertyId,
		input.unitId,
		input.tenantId
	);
	const [row] = await db
		.insert(guestPass)
		.values({ ...input, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'guest_pass',
		entityId: row!.id,
		action: 'issued',
		summary: `Guest pass for ${input.guestName} at ${propertyName}${residentName ? ` (host ${residentName})` : ''}`
	});
	return row!;
}

export async function closePass(ctx: OrgContext, id: string, status: 'used' | 'void') {
	const [row] = await db
		.update(guestPass)
		.set({ status })
		.where(
			and(
				eq(guestPass.organizationId, ctx.orgId),
				eq(guestPass.id, id),
				eq(guestPass.status, 'active')
			)
		)
		.returning();
	if (!row) error(404, 'Pass not found or already closed');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'guest_pass',
		entityId: id,
		action: status,
		summary: `Guest pass for ${row.guestName} ${status}`
	});
}

// ---------- Community events ----------

export async function listEvents(orgId: string, opts: { includeCancelled?: boolean } = {}) {
	return db
		.select({
			id: communityEvent.id,
			title: communityEvent.title,
			description: communityEvent.description,
			location: communityEvent.location,
			startsAt: communityEvent.startsAt,
			endsAt: communityEvent.endsAt,
			capacity: communityEvent.capacity,
			status: communityEvent.status,
			propertyId: communityEvent.propertyId,
			propertyName: property.name
		})
		.from(communityEvent)
		.innerJoin(property, eq(property.id, communityEvent.propertyId))
		.where(
			and(
				eq(communityEvent.organizationId, orgId),
				opts.includeCancelled ? undefined : eq(communityEvent.status, 'scheduled')
			)
		)
		.orderBy(asc(communityEvent.startsAt))
		.limit(200);
}

export async function createEvent(ctx: OrgContext, input: Out<typeof eventInput>) {
	const [p] = await db
		.select({ name: property.name })
		.from(property)
		.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, input.propertyId)));
	if (!p) error(404, 'Property not found');
	const startsAt = new Date(input.startsAt);
	if (Number.isNaN(startsAt.getTime())) error(400, 'Bad start time');
	const endsAt = input.endsAt ? new Date(input.endsAt) : null;
	if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt))
		error(400, 'End must be after the start');
	const [row] = await db
		.insert(communityEvent)
		.values({ ...input, startsAt, endsAt, organizationId: ctx.orgId, createdBy: ctx.userId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'community_event',
		entityId: row!.id,
		action: 'scheduled',
		summary: `${input.title} at ${p.name} on ${startsAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })}`
	});
	return row!;
}

export async function cancelEvent(ctx: OrgContext, id: string) {
	const [row] = await db
		.update(communityEvent)
		.set({ status: 'cancelled' })
		.where(
			and(
				eq(communityEvent.organizationId, ctx.orgId),
				eq(communityEvent.id, id),
				eq(communityEvent.status, 'scheduled')
			)
		)
		.returning();
	if (!row) error(404, 'Event not found or already cancelled');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'community_event',
		entityId: id,
		action: 'cancelled',
		summary: `${row.title} cancelled`
	});
}

// ---------- Pulse surveys ----------

export async function listSurveys(orgId: string) {
	const rows = await db
		.select({
			id: survey.id,
			title: survey.title,
			question: survey.question,
			status: survey.status,
			createdAt: survey.createdAt,
			propertyName: property.name,
			responses:
				sql<number>`(select count(*) from survey_response r where r.survey_id = ${survey.id})`.mapWith(
					Number
				),
			avgRating: sql<
				number | null
			>`(select avg(r.rating) from survey_response r where r.survey_id = ${survey.id} and r.rating is not null)`
		})
		.from(survey)
		.leftJoin(property, eq(property.id, survey.propertyId))
		.where(eq(survey.organizationId, orgId))
		.orderBy(desc(survey.createdAt));
	return rows.map((r) => ({ ...r, avgRating: r.avgRating === null ? null : Number(r.avgRating) }));
}

export async function listSurveyResponses(orgId: string, surveyId: string) {
	return db
		.select({
			id: surveyResponse.id,
			rating: surveyResponse.rating,
			comment: surveyResponse.comment,
			createdAt: surveyResponse.createdAt,
			tenantFirst: tenant.firstName,
			tenantLast: tenant.lastName,
			tenantCompany: tenant.companyName
		})
		.from(surveyResponse)
		.innerJoin(tenant, eq(tenant.id, surveyResponse.tenantId))
		.where(and(eq(surveyResponse.organizationId, orgId), eq(surveyResponse.surveyId, surveyId)))
		.orderBy(desc(surveyResponse.createdAt));
}

export async function createSurvey(ctx: OrgContext, input: Out<typeof surveyInput>) {
	if (input.propertyId) {
		const [p] = await db
			.select({ id: property.id })
			.from(property)
			.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, input.propertyId)));
		if (!p) error(404, 'Property not found');
	}
	const [row] = await db
		.insert(survey)
		.values({ ...input, organizationId: ctx.orgId, createdBy: ctx.userId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'survey',
		entityId: row!.id,
		action: 'opened',
		summary: `Survey opened: ${input.title}`
	});
	return row!;
}

export async function closeSurvey(ctx: OrgContext, id: string) {
	const [row] = await db
		.update(survey)
		.set({ status: 'closed' })
		.where(and(eq(survey.organizationId, ctx.orgId), eq(survey.id, id), eq(survey.status, 'open')))
		.returning();
	if (!row) error(404, 'Survey not found or already closed');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'survey',
		entityId: id,
		action: 'closed',
		summary: `Survey closed: ${row.title}`
	});
}

/** Open surveys a portal tenant can see (their property or org-wide), annotated with their answer. */
export async function portalSurveys(tenantIds: string[], propertyIds: string[], orgIds: string[]) {
	if (!tenantIds.length || !orgIds.length) return [];
	const rows = await db
		.select({
			id: survey.id,
			title: survey.title,
			question: survey.question,
			propertyName: property.name
		})
		.from(survey)
		.leftJoin(property, eq(property.id, survey.propertyId))
		.where(
			and(
				inArray(survey.organizationId, orgIds),
				eq(survey.status, 'open'),
				propertyIds.length
					? or(isNull(survey.propertyId), inArray(survey.propertyId, propertyIds))
					: isNull(survey.propertyId)
			)
		)
		.orderBy(desc(survey.createdAt))
		.limit(10);
	if (!rows.length) return [];
	const answered = await db
		.select({ surveyId: surveyResponse.surveyId })
		.from(surveyResponse)
		.where(
			and(
				inArray(surveyResponse.surveyId, rows.map((r) => r.id)),
				inArray(surveyResponse.tenantId, tenantIds)
			)
		);
	const answeredIds = new Set(answered.map((a) => a.surveyId));
	return rows.map((r) => ({ ...r, answeredId: answeredIds.has(r.id) ? r.id : null }));
}

/** Record (or update) a portal tenant's answer to an open survey they can see. */
export async function answerSurvey(userId: string, input: Out<typeof surveyResponseInput>) {
	const tenants = await db
		.select({ id: tenant.id, orgId: tenant.organizationId })
		.from(tenant)
		.where(eq(tenant.portalUserId, userId));
	if (!tenants.length) error(403, 'No tenant account');
	const tenantIds = tenants.map((t) => t.id);
	const [s] = await db
		.select({
			id: survey.id,
			orgId: survey.organizationId,
			propertyId: survey.propertyId,
			status: survey.status
		})
		.from(survey)
		.where(
			and(
				eq(survey.id, input.surveyId),
				inArray(
					survey.organizationId,
					tenants.map((t) => t.orgId)
				)
			)
		);
	if (!s || s.status !== 'open') error(404, 'Survey not found');
	if (s.propertyId) {
		const [visible] = await db
			.select({ id: leaseTenant.tenantId })
			.from(leaseTenant)
			.innerJoin(lease, eq(lease.id, leaseTenant.leaseId))
			.innerJoin(unit, eq(unit.id, lease.unitId))
			.where(and(inArray(leaseTenant.tenantId, tenantIds), eq(unit.propertyId, s.propertyId)))
			.limit(1);
		if (!visible) error(404, 'Survey not found');
	}
	const target = tenantIds[0]!;
	const [existing] = await db
		.select({ id: surveyResponse.id })
		.from(surveyResponse)
		.where(and(eq(surveyResponse.surveyId, s.id), eq(surveyResponse.tenantId, target)));
	if (existing) {
		await db
			.update(surveyResponse)
			.set({ rating: input.rating ?? null, comment: input.comment ?? null })
			.where(eq(surveyResponse.id, existing.id));
		return { id: existing.id };
	}
	const [row] = await db
		.insert(surveyResponse)
		.values({
			organizationId: s.orgId,
			surveyId: s.id,
			tenantId: target,
			rating: input.rating ?? null,
			comment: input.comment ?? null
		})
		.returning();
	return row!;
}
