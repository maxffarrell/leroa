import { and, asc, desc, eq, inArray, like, ne, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	document,
	listing,
	organization,
	property,
	rentalApplication,
	unit
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type {
	applicationApprove,
	applicationInput,
	applicationUpdate,
	listingCreate,
	listingStatusInput,
	listingUpdate
} from '#lib/schemas.ts';
import { defaultListingTitle } from '#lib/listings.ts';
import { formatMoney } from '#lib/format.ts';
import { isDemo } from '#lib/server/demo-mode.ts';
import { store } from './storage.ts';
import { emit } from './events.ts';
import { createTenant } from './portfolio.ts';
import { createLease } from './leasing.ts';
import { notifyApplicationReceived, notifyNewApplication } from './notifications.ts';
import { markTurnListed } from './turns.ts';
import { leadApplicationApproved, leadFromApplication } from './crm.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const PHOTO = 'listing';
const IMAGE = /^image\/(png|jpeg|gif|webp|avif)$/;
const OPEN_APPLICATION = ['new', 'reviewing'] as const;

const newApplications = sql<number>`(
	select count(*) from ${rentalApplication}
	where ${rentalApplication.listingId} = ${listing.id} and ${rentalApplication.status} = 'new'
)`.mapWith(Number);

const firstPhoto = sql<string | null>`(
	select ${document.id} from ${document}
	where ${document.entityType} = ${PHOTO} and ${document.entityId} = ${listing.id}
		and ${document.contentType} like 'image/%'
	order by ${document.createdAt} limit 1
)`;

const placeFields = {
	unitName: unit.name,
	bedrooms: unit.bedrooms,
	bathrooms: unit.bathrooms,
	areaSqft: unit.areaSqft,
	propertyId: property.id,
	propertyName: property.name,
	addressLine1: property.addressLine1,
	city: property.city,
	region: property.region,
	postalCode: property.postalCode
};

function uniqueViolation(err: unknown) {
	return (
		(err as { cause?: { code?: string }; code?: string })?.cause?.code === '23505' ||
		(err as { code?: string })?.code === '23505'
	);
}

async function photosOf(listingId: string) {
	return db
		.select({ id: document.id, name: document.name })
		.from(document)
		.where(
			and(
				eq(document.entityType, PHOTO),
				eq(document.entityId, listingId),
				like(document.contentType, 'image/%')
			)
		)
		.orderBy(asc(document.createdAt));
}

export async function listListings(orgId: string) {
	return db
		.select({
			id: listing.id,
			status: listing.status,
			title: listing.title,
			rentAmount: listing.rentAmount,
			currency: listing.currency,
			availableOn: listing.availableOn,
			publishedAt: listing.publishedAt,
			unitId: listing.unitId,
			photoId: firstPhoto,
			newApplications,
			...placeFields
		})
		.from(listing)
		.innerJoin(unit, eq(unit.id, listing.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(eq(listing.organizationId, orgId))
		.orderBy(sql`${listing.status} = 'closed'`, desc(listing.updatedAt));
}

export async function getListing(orgId: string, id: string) {
	const [row] = await db
		.select({ listing, ...placeFields })
		.from(listing)
		.innerJoin(unit, eq(unit.id, listing.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(listing.organizationId, orgId), eq(listing.id, id)));
	if (!row) error(404, 'Listing not found');
	const { listing: l, ...place } = row;
	const [counts] = await db
		.select({
			total: sql<number>`count(*)`.mapWith(Number),
			new: sql<number>`count(*) filter (where ${rentalApplication.status} = 'new')`.mapWith(Number)
		})
		.from(rentalApplication)
		.where(eq(rentalApplication.listingId, id));
	return { ...l, ...place, photos: await photosOf(id), applications: counts! };
}

/** Starts a draft listing for a unit, or returns the unit's open listing if it has one. */
export async function createListing(ctx: OrgContext, { unitId }: Out<typeof listingCreate>) {
	const [u] = await db
		.select({
			id: unit.id,
			name: unit.name,
			bedrooms: unit.bedrooms,
			bathrooms: unit.bathrooms,
			areaSqft: unit.areaSqft,
			marketRent: unit.marketRent,
			propertyName: property.name
		})
		.from(unit)
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(unit.organizationId, ctx.orgId), eq(unit.id, unitId)));
	if (!u) error(404, 'Unit not found');

	const [open] = await db
		.select({ id: listing.id })
		.from(listing)
		.where(and(eq(listing.unitId, unitId), ne(listing.status, 'closed')));
	if (open) return { id: open.id, existing: true };

	const rent = u.marketRent ?? 0;
	try {
		const [l] = await db
			.insert(listing)
			.values({
				organizationId: ctx.orgId,
				unitId,
				title: defaultListingTitle(u.propertyName, u.name, u),
				rentAmount: rent,
				depositAmount: rent
			})
			.returning({ id: listing.id });
		return { id: l!.id, existing: false };
	} catch (err) {
		if (uniqueViolation(err)) error(409, 'This unit already has an open listing');
		throw err;
	}
}

export async function updateListing(ctx: OrgContext, { id, ...data }: Out<typeof listingUpdate>) {
	const [l] = await db
		.update(listing)
		.set(data)
		.where(and(eq(listing.organizationId, ctx.orgId), eq(listing.id, id)))
		.returning();
	if (!l) error(404, 'Listing not found');
	return l;
}

export async function setListingStatus(
	ctx: OrgContext,
	{ id, status }: Out<typeof listingStatusInput>
) {
	const current = await getListing(ctx.orgId, id);
	if (status === 'published') {
		if (current.rentAmount <= 0) error(400, 'Set the rent before publishing');
		if (!current.title.trim()) error(400, 'Add a title before publishing');
	}
	let l;
	try {
		[l] = await db
			.update(listing)
			.set({
				status,
				...(status === 'published' && !current.publishedAt ? { publishedAt: new Date() } : {})
			})
			.where(and(eq(listing.organizationId, ctx.orgId), eq(listing.id, id)))
			.returning();
	} catch (err) {
		if (uniqueViolation(err)) error(409, 'This unit already has another open listing');
		throw err;
	}
	if (status === 'published') await markTurnListed(ctx, current.unitId);
	if (status !== current.status && status !== 'draft') {
		await emit({
			orgId: ctx.orgId,
			actorId: ctx.userId,
			entityType: 'listing',
			entityId: id,
			action: status,
			summary: `${status === 'published' ? 'Published' : 'Closed'} listing “${current.title}”`
		});
	}
	return l!;
}

export async function deleteListing(ctx: OrgContext, id: string) {
	const photos = await photosOf(id);
	const [l] = await db
		.delete(listing)
		.where(and(eq(listing.organizationId, ctx.orgId), eq(listing.id, id)))
		.returning({ id: listing.id });
	if (!l) error(404, 'Listing not found');
	if (photos.length) {
		const docs = await db
			.delete(document)
			.where(
				and(
					eq(document.organizationId, ctx.orgId),
					inArray(
						document.id,
						photos.map((p) => p.id)
					)
				)
			)
			.returning({ storageKey: document.storageKey });
		for (const d of docs) await store.delete(d.storageKey);
	}
}

// ── Public pages ────────────────────────────────────────────────────────────

async function orgBySlug(slug: string) {
	const [org] = await db
		.select({
			id: organization.id,
			name: organization.name,
			slug: organization.slug,
			accentColor: organization.accentColor,
			portalTitle: organization.portalTitle
		})
		.from(organization)
		.where(eq(organization.slug, slug));
	if (!org) error(404, 'Not found');
	return org;
}

/** Published listings for a workspace's public page. */
export async function publicListings(slug: string) {
	const org = await orgBySlug(slug);
	const listings = await db
		.select({
			id: listing.id,
			title: listing.title,
			rentAmount: listing.rentAmount,
			currency: listing.currency,
			availableOn: listing.availableOn,
			photoId: firstPhoto,
			...placeFields
		})
		.from(listing)
		.innerJoin(unit, eq(unit.id, listing.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(listing.organizationId, org.id), eq(listing.status, 'published')))
		.orderBy(asc(listing.availableOn), asc(listing.rentAmount));
	return { org, listings };
}

/**
 * A single listing. Published listings are public; drafts and closed listings are visible only
 * to members of the owning workspace (`viewerOrgId`), so managers can preview before publishing.
 */
export async function publicListing(slug: string, id: string, viewerOrgId: string | null) {
	const org = await orgBySlug(slug);
	const [row] = await db
		.select({ listing, ...placeFields })
		.from(listing)
		.innerJoin(unit, eq(unit.id, listing.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(listing.organizationId, org.id), eq(listing.id, id)));
	const staff = viewerOrgId === org.id;
	if (!row || (row.listing.status !== 'published' && !staff)) error(404, 'Not found');
	const { listing: l, ...place } = row;
	return {
		org,
		preview: l.status !== 'published',
		listing: {
			id: l.id,
			status: l.status,
			title: l.title,
			description: l.description,
			rentAmount: l.rentAmount,
			depositAmount: l.depositAmount,
			currency: l.currency,
			availableOn: l.availableOn,
			leaseTermMonths: l.leaseTermMonths,
			petPolicy: l.petPolicy,
			amenities: l.amenities,
			...place
		},
		photos: (await photosOf(id)).map((p) => p.id)
	};
}

/** Image bytes for a listing photo, under the same visibility rule as the listing. */
export async function listingPhoto(listingId: string, photoId: string, viewerOrgId: string | null) {
	const [row] = await db
		.select({ doc: document, status: listing.status, orgId: listing.organizationId })
		.from(document)
		.innerJoin(listing, eq(listing.id, document.entityId))
		.where(
			and(
				eq(document.id, photoId),
				eq(document.entityType, PHOTO),
				eq(document.entityId, listingId),
				eq(document.organizationId, listing.organizationId)
			)
		);
	if (!row || !IMAGE.test(row.doc.contentType)) error(404, 'Not found');
	if (row.status !== 'published' && viewerOrgId !== row.orgId) error(404, 'Not found');
	const data = await store.get(row.doc.storageKey);
	if (!data) error(404, 'Not found');
	return { doc: row.doc, data, public: row.status === 'published' };
}

// ── Applications ────────────────────────────────────────────────────────────

const MAX_APPLICATIONS_PER_IP_PER_HOUR = 5;
const recent = new Map<string, number[]>();

function rateLimit(ip: string | null) {
	if (!ip) return;
	const now = Date.now();
	const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
	if (hits.length >= MAX_APPLICATIONS_PER_IP_PER_HOUR)
		error(429, 'Too many applications from this connection. Try again in an hour.');
	recent.set(ip, [...hits, now]);
	if (recent.size > 10_000) recent.clear();
}

export async function submitApplication(
	input: Out<typeof applicationInput>,
	meta: { ip: string | null; userAgent: string | null }
) {
	const { listingId, consent: _consent, website, ...data } = input;
	// Bots fill every field; pretend it worked so they don't adapt.
	if (website) return { ok: true };
	rateLimit(meta.ip);

	const [l] = await db
		.select({
			id: listing.id,
			orgId: listing.organizationId,
			unitId: listing.unitId,
			title: listing.title,
			status: listing.status
		})
		.from(listing)
		.where(eq(listing.id, listingId));
	if (!l || l.status !== 'published')
		error(404, 'This listing is no longer accepting applications');

	const email = data.email.toLowerCase();
	const [dupe] = await db
		.select({ id: rentalApplication.id })
		.from(rentalApplication)
		.where(
			and(
				eq(rentalApplication.listingId, l.id),
				eq(rentalApplication.email, email),
				inArray(rentalApplication.status, OPEN_APPLICATION)
			)
		);
	if (dupe) error(409, 'You have already applied for this home. We will be in touch.');

	const [app] = await db
		.insert(rentalApplication)
		.values({
			...data,
			email,
			organizationId: l.orgId,
			listingId: l.id,
			unitId: l.unitId,
			consentAt: new Date(),
			ip: meta.ip,
			userAgent: meta.userAgent?.slice(0, 500) ?? null
		})
		.returning();
	await emit({
		orgId: l.orgId,
		entityType: 'application',
		entityId: app!.id,
		action: 'submitted',
		summary: `${app!.firstName} ${app!.lastName} applied for “${l.title}”`,
		data: { listingId: l.id, unitId: l.unitId }
	});
	await leadFromApplication(l.orgId, app!, l);
	// The public demo must not send email to addresses typed in by strangers.
	if (!isDemo()) await notifyApplicationReceived(l.orgId, app!, l.title);
	await notifyNewApplication(l.orgId, app!, l.title);
	return { ok: true };
}

export async function listApplications(orgId: string) {
	return db
		.select({
			id: rentalApplication.id,
			status: rentalApplication.status,
			firstName: rentalApplication.firstName,
			lastName: rentalApplication.lastName,
			email: rentalApplication.email,
			moveInDate: rentalApplication.moveInDate,
			monthlyIncome: rentalApplication.monthlyIncome,
			occupants: rentalApplication.occupants,
			createdAt: rentalApplication.createdAt,
			listingId: rentalApplication.listingId,
			listingTitle: listing.title,
			unitName: unit.name,
			propertyName: property.name
		})
		.from(rentalApplication)
		.leftJoin(listing, eq(listing.id, rentalApplication.listingId))
		.leftJoin(unit, eq(unit.id, rentalApplication.unitId))
		.leftJoin(property, eq(property.id, unit.propertyId))
		.where(eq(rentalApplication.organizationId, orgId))
		.orderBy(desc(rentalApplication.createdAt));
}

export async function getApplication(orgId: string, id: string) {
	const [row] = await db
		.select({
			app: rentalApplication,
			listingTitle: listing.title,
			listingStatus: listing.status,
			listingRent: listing.rentAmount,
			listingDeposit: listing.depositAmount,
			listingAvailableOn: listing.availableOn,
			listingTerm: listing.leaseTermMonths,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name
		})
		.from(rentalApplication)
		.leftJoin(listing, eq(listing.id, rentalApplication.listingId))
		.leftJoin(unit, eq(unit.id, rentalApplication.unitId))
		.leftJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(rentalApplication.organizationId, orgId), eq(rentalApplication.id, id)));
	if (!row) error(404, 'Application not found');
	const { app, ...rest } = row;
	const others = app.listingId
		? await db
				.select({ id: rentalApplication.id })
				.from(rentalApplication)
				.where(
					and(
						eq(rentalApplication.listingId, app.listingId),
						ne(rentalApplication.id, id),
						inArray(rentalApplication.status, OPEN_APPLICATION)
					)
				)
		: [];
	return { ...app, ...rest, openSiblings: others.length };
}

export async function updateApplication(
	ctx: OrgContext,
	{ id, status, notes }: Out<typeof applicationUpdate>
) {
	const current = await getApplication(ctx.orgId, id);
	if (status && current.status === 'approved')
		error(409, 'This application was approved and already has a lease');
	const deciding = status === 'declined' && current.status !== 'declined';
	const [app] = await db
		.update(rentalApplication)
		.set({
			...(status ? { status } : {}),
			...(notes !== undefined ? { notes } : {}),
			...(deciding ? { decidedAt: new Date(), decidedBy: ctx.userId } : {}),
			...(status && status !== 'declined' ? { decidedAt: null, decidedBy: null } : {})
		})
		.where(and(eq(rentalApplication.organizationId, ctx.orgId), eq(rentalApplication.id, id)))
		.returning();
	if (deciding) {
		await emit({
			orgId: ctx.orgId,
			actorId: ctx.userId,
			entityType: 'application',
			entityId: id,
			action: 'declined',
			summary: `Declined application from ${current.firstName} ${current.lastName}`
		});
	}
	return app!;
}

/**
 * Turns an application into a tenant and a draft lease for the listed unit, and closes the
 * listing. The lease stays a draft so the manager can send an agreement before activating it.
 */
export async function approveApplication(ctx: OrgContext, input: Out<typeof applicationApprove>) {
	const app = await getApplication(ctx.orgId, input.id);
	if (app.status === 'approved') error(409, 'This application was already approved');
	if (app.status === 'withdrawn') error(409, 'The applicant withdrew this application');
	if (!app.unitId) error(409, 'The unit for this application no longer exists');
	if (input.endDate && input.endDate < input.startDate)
		error(400, 'End date must be after the start date');

	const [claimed] = await db
		.update(rentalApplication)
		.set({ status: 'approved', decidedAt: new Date(), decidedBy: ctx.userId })
		.where(
			and(
				eq(rentalApplication.id, app.id),
				inArray(rentalApplication.status, ['new', 'reviewing', 'declined'])
			)
		)
		.returning({ id: rentalApplication.id });
	if (!claimed) error(409, 'This application was already approved');

	try {
		const t = await createTenant(ctx, {
			kind: 'person',
			firstName: app.firstName,
			lastName: app.lastName,
			email: app.email,
			phone: app.phone,
			companyName: null,
			notes: null
		});
		const l = await createLease(ctx, {
			unitId: app.unitId,
			tenantIds: [t.id],
			status: 'draft',
			startDate: input.startDate,
			endDate: input.endDate ?? null,
			rentAmount: input.rentAmount,
			depositAmount: input.depositAmount,
			rentDueDay: 1,
			frequency: 'monthly',
			currency: 'USD',
			lateFeeAmount: 0,
			lateFeeGraceDays: 5,
			notes: null
		});
		await db
			.update(rentalApplication)
			.set({ tenantId: t.id, leaseId: l.id })
			.where(eq(rentalApplication.id, app.id));
		if (app.listingId && app.listingStatus !== 'closed')
			await setListingStatus(ctx, { id: app.listingId, status: 'closed' });
		await leadApplicationApproved(ctx, app.id, t.id);
		await emit({
			orgId: ctx.orgId,
			actorId: ctx.userId,
			entityType: 'application',
			entityId: app.id,
			action: 'approved',
			summary: `Approved ${app.firstName} ${app.lastName} at ${formatMoney(input.rentAmount)}/mo`,
			data: { tenantId: t.id, leaseId: l.id }
		});
		return { tenantId: t.id, leaseId: l.id };
	} catch (err) {
		await db
			.update(rentalApplication)
			.set({ status: app.status, decidedAt: app.decidedAt, decidedBy: app.decidedBy })
			.where(eq(rentalApplication.id, app.id));
		throw err;
	}
}
