import { allows } from '#lib/api-permissions.ts';
import { assertRecordAccess } from '#lib/server/access.ts';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	activity,
	document,
	lead,
	leadNote,
	leasingSettings,
	listing,
	member,
	notificationLog,
	organization,
	property,
	rentalApplication,
	tour,
	unit,
	user
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import { hasFeature } from '#lib/server/features.ts';
import { scoreLead } from '#lib/server/ai/decisions.ts';
import type {
	inquiryInput,
	leadInput,
	leadNoteInput,
	leadUpdate,
	leasingSettingsInput,
	propertyMarketingInput,
	tourBookingInput,
	tourInput,
	tourSlotsInput,
	tourUpdate
} from '#lib/schemas.ts';
import {
	advanceStage,
	LEAD_STAGE_LABELS,
	leadName,
	matchesWaitlist,
	OPEN_LEAD_STAGES,
	type LeadStage
} from '#lib/leads.ts';
import {
	formatTourTimeZoned,
	isBookable,
	isValidTimezone,
	localDate,
	TOUR_DEFAULTS,
	tourSlots,
	zonedToUtc,
	type TourHours
} from '#lib/tours.ts';
import { appOrigin } from '#lib/server/email.ts';
import { assertNotDemo, isDemo } from '#lib/server/demo-mode.ts';
import { emit } from './events.ts';
import { notifyLeadActivity, notifyTourConfirmed, notifyWaitlistOpening } from './notifications.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;
type LeadRow = typeof lead.$inferSelect;
type NoteKind = (typeof leadNote.$inferInsert)['kind'];

const assignee = alias(user, 'assignee');
const agent = alias(user, 'agent');
const author = alias(user, 'author');
const MINUTE = 60_000;

// ── References ──────────────────────────────────────────────────────────────

async function assertMember(orgId: string, userId: string) {
	const [m] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
	if (!m) error(400, 'Pick someone on your team');
}

/**
 * Validates that a property, listing and team member belong to the workspace. A listing implies
 * its property; with `loose`, a listing at a different property is dropped instead of rejected.
 */
async function checkRefs(
	orgId: string,
	refs: { propertyId?: string | null; listingId?: string | null; userId?: string | null },
	loose = false
) {
	let propertyId = refs.propertyId ?? null;
	let listingId = refs.listingId ?? null;
	if (listingId) {
		const [l] = await db
			.select({ propertyId: unit.propertyId })
			.from(listing)
			.innerJoin(unit, eq(unit.id, listing.unitId))
			.where(and(eq(listing.organizationId, orgId), eq(listing.id, listingId)));
		if (!l) error(404, 'Listing not found');
		if (propertyId && propertyId !== l.propertyId) {
			if (!loose) error(400, 'That listing is at a different property');
			listingId = null;
		} else propertyId = l.propertyId;
	}
	if (propertyId) {
		const [p] = await db
			.select({ id: property.id })
			.from(property)
			.where(and(eq(property.organizationId, orgId), eq(property.id, propertyId)));
		if (!p) error(404, 'Property not found');
	}
	if (refs.userId) await assertMember(orgId, refs.userId);
	return { propertyId, listingId };
}

async function leadRow(orgId: string, id: string) {
	const [row] = await db
		.select()
		.from(lead)
		.where(and(eq(lead.organizationId, orgId), eq(lead.id, id)));
	if (!row) error(404, 'Lead not found');
	return row;
}

async function stageChanged(
	orgId: string,
	actorId: string | null,
	l: Pick<LeadRow, 'id' | 'firstName' | 'lastName'>,
	from: LeadStage,
	to: LeadStage
) {
	if (from === to) return;
	await emit({
		orgId,
		actorId,
		entityType: 'lead',
		entityId: l.id,
		action: 'stage_changed',
		summary: `${leadName(l)} moved to ${LEAD_STAGE_LABELS[to]}`,
		data: { from, to }
	});
}

// ── Leads ───────────────────────────────────────────────────────────────────

const nextTourAt = sql<Date | null>`(
	select min(${tour.startsAt}) from ${tour}
	where ${tour.leadId} = ${lead.id} and ${tour.status} = 'scheduled' and ${tour.startsAt} >= now()
)`.mapWith((v) => (v ? new Date(v) : null));

export async function listLeads(orgId: string) {
	return db
		.select({
			id: lead.id,
			stage: lead.stage,
			source: lead.source,
			firstName: lead.firstName,
			lastName: lead.lastName,
			email: lead.email,
			phone: lead.phone,
			propertyId: lead.propertyId,
			propertyName: property.name,
			listingId: lead.listingId,
			listingTitle: listing.title,
			moveInDate: lead.moveInDate,
			bedrooms: lead.bedrooms,
			budgetMax: lead.budgetMax,
			assignedTo: lead.assignedTo,
			assigneeName: assignee.name,
			nextFollowUpOn: lead.nextFollowUpOn,
			lastContactedAt: lead.lastContactedAt,
			waitlist: lead.waitlist,
			waitlistedAt: lead.waitlistedAt,
			applicationId: lead.applicationId,
			aiScore: lead.aiScore,
			aiScoreReason: lead.aiScoreReason,
			createdAt: lead.createdAt,
			updatedAt: lead.updatedAt,
			nextTourAt
		})
		.from(lead)
		.leftJoin(property, eq(property.id, lead.propertyId))
		.leftJoin(listing, eq(listing.id, lead.listingId))
		.leftJoin(assignee, eq(assignee.id, lead.assignedTo))
		.where(eq(lead.organizationId, orgId))
		.orderBy(desc(lead.createdAt));
}

export type LeadListItem = Awaited<ReturnType<typeof listLeads>>[number];

export async function getLead(orgId: string, id: string) {
	const [row] = await db
		.select({
			lead,
			propertyName: property.name,
			listingTitle: listing.title,
			listingStatus: listing.status,
			assigneeName: assignee.name,
			applicationStatus: rentalApplication.status
		})
		.from(lead)
		.leftJoin(property, eq(property.id, lead.propertyId))
		.leftJoin(listing, eq(listing.id, lead.listingId))
		.leftJoin(assignee, eq(assignee.id, lead.assignedTo))
		.leftJoin(rentalApplication, eq(rentalApplication.id, lead.applicationId))
		.where(and(eq(lead.organizationId, orgId), eq(lead.id, id)));
	if (!row) error(404, 'Lead not found');
	const [notes, tours, events] = await Promise.all([
		db
			.select({
				id: leadNote.id,
				kind: leadNote.kind,
				body: leadNote.body,
				createdAt: leadNote.createdAt,
				authorName: author.name
			})
			.from(leadNote)
			.leftJoin(author, eq(author.id, leadNote.authorId))
			.where(and(eq(leadNote.organizationId, orgId), eq(leadNote.leadId, id)))
			.orderBy(desc(leadNote.createdAt)),
		toursQuery().where(and(eq(tour.organizationId, orgId), eq(tour.leadId, id))),
		db
			.select({
				id: activity.id,
				action: activity.action,
				summary: activity.summary,
				createdAt: activity.createdAt,
				actorName: user.name
			})
			.from(activity)
			.leftJoin(user, eq(user.id, activity.actorId))
			.where(
				and(
					eq(activity.organizationId, orgId),
					eq(activity.entityType, 'lead'),
					eq(activity.entityId, id)
				)
			)
			.orderBy(desc(activity.createdAt))
			.limit(100)
	]);
	const { lead: l, ...rest } = row;
	return { ...l, ...rest, notes, tours, events };
}

type CaptureOptions = {
	actorId?: string | null;
	note?: { kind: NoteKind; body: string };
	advanceTo?: LeadStage;
	applicationId?: string;
	consent?: boolean;
};

/**
 * Creates a lead, or folds the details into the open lead with the same email so repeat
 * inquiries, tour bookings and applications land on one record. Existing values win; empty
 * fields are filled in. References must already be validated.
 */
async function captureLead(
	orgId: string,
	data: Out<typeof leadInput>,
	opts: CaptureOptions = {},
	ctx?: OrgContext
) {
	const email = data.email?.toLowerCase() || null;
	const [existing] = email
		? await db
				.select()
				.from(lead)
				.where(
					and(
						eq(lead.organizationId, orgId),
						eq(lead.email, email),
						inArray(lead.stage, OPEN_LEAD_STAGES)
					)
				)
				.orderBy(desc(lead.createdAt))
				.limit(1)
		: [];
	const now = new Date();
	let row: LeadRow;
	if (existing) {
		if (ctx) await assertRecordAccess(ctx, 'leads', existing.id);
		const fill = <K extends keyof LeadRow>(k: K, value: LeadRow[K] | undefined) =>
			existing[k] == null && value != null ? { [k]: value } : {};
		const stage = opts.advanceTo ? advanceStage(existing.stage, opts.advanceTo) : existing.stage;
		[row] = (await db
			.update(lead)
			.set({
				...fill('phone', data.phone),
				...fill('propertyId', data.propertyId),
				...fill('listingId', data.listingId),
				...fill('moveInDate', data.moveInDate),
				...fill('bedrooms', data.bedrooms),
				...fill('budgetMax', data.budgetMax),
				...fill('assignedTo', data.assignedTo),
				...fill('nextFollowUpOn', data.nextFollowUpOn),
				...fill('consentAt', opts.consent ? now : undefined),
				...(data.waitlist && !existing.waitlist ? { waitlist: true, waitlistedAt: now } : {}),
				...(opts.applicationId ? { applicationId: opts.applicationId } : {}),
				stage
			})
			.where(eq(lead.id, existing.id))
			.returning()) as [LeadRow];
		await stageChanged(orgId, opts.actorId ?? null, row, existing.stage, stage);
	} else {
		[row] = (await db
			.insert(lead)
			.values({
				...data,
				email,
				organizationId: orgId,
				stage: opts.advanceTo ?? 'new',
				waitlistedAt: data.waitlist ? now : null,
				applicationId: opts.applicationId ?? null,
				consentAt: opts.consent ? now : null
			})
			.returning()) as [LeadRow];
		if (hasFeature('ai')) {
			const [prop, lst] = await Promise.all([
				data.propertyId
					? db
							.select({ name: property.name })
							.from(property)
							.where(eq(property.id, data.propertyId))
							.limit(1)
					: Promise.resolve([]),
				data.listingId
					? db
							.select({ title: listing.title })
							.from(listing)
							.where(eq(listing.id, data.listingId))
							.limit(1)
					: Promise.resolve([])
			]);
			const s = await scoreLead(orgId, {
				email,
				phone: data.phone,
				moveInDate: data.moveInDate,
				bedrooms: data.bedrooms,
				budgetMax: data.budgetMax,
				propertyName: prop[0]?.name ?? null,
				listingTitle: lst[0]?.title ?? null,
				source: data.source,
				message: data.message
			});
			[row] = (await db
				.update(lead)
				.set({ aiScore: s.score, aiScoreReason: s.reason })
				.where(eq(lead.id, row.id))
				.returning()) as [LeadRow];
		}
		await emit({
			orgId,
			actorId: opts.actorId ?? null,
			entityType: 'lead',
			entityId: row.id,
			action: 'created',
			summary: `New lead: ${leadName(row)}`,
			data: { source: row.source, propertyId: row.propertyId, listingId: row.listingId }
		});
	}
	let noteId: string | null = null;
	if (opts.note) {
		const [n] = await db
			.insert(leadNote)
			.values({
				organizationId: orgId,
				leadId: row.id,
				kind: opts.note.kind,
				body: opts.note.body,
				authorId: opts.actorId ?? null
			})
			.returning({ id: leadNote.id });
		noteId = n!.id;
	}
	return { lead: row, existing: !!existing, noteId };
}

/** Adds a lead from the app or the API. A lead with the same email that's still open is reused. */
export async function createLead(ctx: OrgContext, input: Out<typeof leadInput>) {
	if (ctx.propertyIds && !input.propertyId && !input.listingId)
		error(403, 'Select an assigned property');
	const refs = await checkRefs(ctx.orgId, {
		propertyId: input.propertyId,
		listingId: input.listingId,
		userId: input.assignedTo
	});
	const { lead: l, existing } = await captureLead(
		ctx.orgId,
		{ ...input, ...refs },
		{
			actorId: ctx.userId,
			note: input.message?.trim() ? { kind: 'inquiry', body: input.message } : undefined
		},
		ctx
	);
	return { ...l, existing };
}

export async function updateLead(ctx: OrgContext, input: Out<typeof leadUpdate>) {
	const { id, stage, lostReason, email, ...rest } = input;
	const current = await leadRow(ctx.orgId, id);
	const touchesRefs =
		rest.propertyId !== undefined || rest.listingId !== undefined || rest.assignedTo;
	const refs = touchesRefs
		? await checkRefs(
				ctx.orgId,
				{
					propertyId: rest.propertyId !== undefined ? rest.propertyId : current.propertyId,
					listingId: rest.listingId !== undefined ? rest.listingId : current.listingId,
					userId: rest.assignedTo
				},
				rest.listingId === undefined
			)
		: {};
	const finalPropertyId = 'propertyId' in refs ? refs.propertyId : current.propertyId;
	if (ctx.propertyIds && !finalPropertyId) error(403, 'Select an assigned property');
	if (ctx.propertyIds && finalPropertyId)
		await assertRecordAccess(ctx, 'properties', finalPropertyId);
	const [row] = await db
		.update(lead)
		.set({
			...rest,
			...refs,
			...(email !== undefined ? { email: email?.toLowerCase() || null } : {}),
			...(stage ? { stage } : {}),
			...(stage === 'lost'
				? { lostReason: lostReason ?? current.lostReason }
				: stage
					? { lostReason: null }
					: lostReason !== undefined
						? { lostReason }
						: {}),
			...(rest.waitlist === true && !current.waitlist ? { waitlistedAt: new Date() } : {}),
			...(rest.waitlist === false ? { waitlistedAt: null } : {}),
			...(stage === 'lost' ? { waitlist: false, waitlistedAt: null } : {})
		})
		.where(and(eq(lead.organizationId, ctx.orgId), eq(lead.id, id)))
		.returning();
	if (stage) await stageChanged(ctx.orgId, ctx.userId, row!, current.stage, stage);
	return row!;
}

export async function deleteLead(ctx: OrgContext, id: string) {
	const [row] = await db
		.delete(lead)
		.where(and(eq(lead.organizationId, ctx.orgId), eq(lead.id, id)))
		.returning({ id: lead.id });
	if (!row) error(404, 'Lead not found');
}

/** Logs a note or contact attempt. Logging a call, email or text marks a new lead contacted. */
export async function addLeadNote(ctx: OrgContext, input: Out<typeof leadNoteInput>) {
	const current = await leadRow(ctx.orgId, input.leadId);
	const [note] = await db
		.insert(leadNote)
		.values({
			organizationId: ctx.orgId,
			leadId: current.id,
			kind: input.kind,
			body: input.body,
			authorId: ctx.userId
		})
		.returning();
	const contact = input.kind !== 'note';
	const stage = contact ? advanceStage(current.stage, 'contacted') : current.stage;
	if (contact || input.nextFollowUpOn !== undefined) {
		await db
			.update(lead)
			.set({
				...(contact ? { lastContactedAt: new Date(), stage } : {}),
				...(input.nextFollowUpOn !== undefined ? { nextFollowUpOn: input.nextFollowUpOn } : {})
			})
			.where(eq(lead.id, current.id));
	}
	await stageChanged(ctx.orgId, ctx.userId, current, current.stage, stage);
	return note!;
}

// ── Tours ───────────────────────────────────────────────────────────────────

function toursQuery() {
	return db
		.select({
			id: tour.id,
			leadId: tour.leadId,
			leadFirstName: lead.firstName,
			leadLastName: lead.lastName,
			leadEmail: lead.email,
			leadPhone: lead.phone,
			propertyId: tour.propertyId,
			propertyName: property.name,
			listingId: tour.listingId,
			listingTitle: listing.title,
			startsAt: tour.startsAt,
			durationMinutes: tour.durationMinutes,
			kind: tour.kind,
			status: tour.status,
			agentId: tour.agentId,
			agentName: agent.name,
			selfBooked: tour.selfBooked,
			notes: tour.notes,
			createdAt: tour.createdAt
		})
		.from(tour)
		.innerJoin(lead, eq(lead.id, tour.leadId))
		.innerJoin(property, eq(property.id, tour.propertyId))
		.leftJoin(listing, eq(listing.id, tour.listingId))
		.leftJoin(agent, eq(agent.id, tour.agentId))
		.orderBy(asc(tour.startsAt))
		.$dynamic();
}

export type TourItem = Awaited<ReturnType<typeof listTours>>[number];

/** Tours from the last 30 days onward. */
export async function listTours(orgId: string) {
	const since = new Date(Date.now() - 30 * 86400_000);
	return toursQuery()
		.where(and(eq(tour.organizationId, orgId), gte(tour.startsAt, since)))
		.limit(1000);
}

export async function getTour(orgId: string, id: string) {
	const [row] = await toursQuery().where(and(eq(tour.organizationId, orgId), eq(tour.id, id)));
	if (!row) error(404, 'Tour not found');
	return row;
}

async function tourCreated(
	orgId: string,
	actorId: string | null,
	l: LeadRow,
	t: typeof tour.$inferSelect,
	propertyName: string
) {
	const stage = advanceStage(l.stage, 'touring');
	await db
		.update(lead)
		.set({ stage, ...(l.propertyId ? {} : { propertyId: t.propertyId }) })
		.where(eq(lead.id, l.id));
	const { timezone } = await getLeasingSettings(orgId);
	await emit({
		orgId,
		actorId,
		entityType: 'lead',
		entityId: l.id,
		action: 'tour_scheduled',
		summary: `Tour with ${leadName(l)} at ${propertyName}, ${formatTourTimeZoned(t.startsAt, timezone)}`,
		data: { tourId: t.id }
	});
	await emit({
		orgId,
		actorId,
		entityType: 'tour',
		entityId: t.id,
		action: 'scheduled',
		summary: `Tour booked with ${leadName(l)} at ${propertyName}`,
		data: { leadId: l.id, propertyId: t.propertyId, startsAt: t.startsAt.toISOString() }
	});
	await stageChanged(orgId, actorId, l, l.stage, stage);
}

export async function scheduleTour(ctx: OrgContext, input: Out<typeof tourInput>) {
	const l = await leadRow(ctx.orgId, input.leadId);
	if (l.stage === 'leased' || l.stage === 'lost') error(409, 'Reopen this lead to book a tour');
	const refs = await checkRefs(ctx.orgId, {
		propertyId: input.propertyId,
		listingId: input.listingId,
		userId: input.agentId
	});
	const [t] = await db
		.insert(tour)
		.values({
			...input,
			propertyId: refs.propertyId!,
			listingId: refs.listingId,
			startsAt: new Date(input.startsAt),
			organizationId: ctx.orgId,
			agentId: input.agentId ?? ctx.userId
		})
		.returning();
	const [p] = await db
		.select({ name: property.name })
		.from(property)
		.where(eq(property.id, t!.propertyId));
	await tourCreated(ctx.orgId, ctx.userId, l, t!, p!.name);
	return t!;
}

export async function updateTour(ctx: OrgContext, { id, ...input }: Out<typeof tourUpdate>) {
	const current = await getTour(ctx.orgId, id);
	if (input.agentId) await assertMember(ctx.orgId, input.agentId);
	const { startsAt, ...rest } = input;
	const [t] = await db
		.update(tour)
		.set({ ...rest, ...(startsAt ? { startsAt: new Date(startsAt) } : {}) })
		.where(and(eq(tour.organizationId, ctx.orgId), eq(tour.id, id)))
		.returning();
	if (input.status && input.status !== current.status) {
		const label = {
			scheduled: 'rescheduled',
			completed: 'completed',
			no_show: 'no-show',
			cancelled: 'cancelled'
		}[input.status];
		const name = leadName({ firstName: current.leadFirstName, lastName: current.leadLastName });
		await emit({
			orgId: ctx.orgId,
			actorId: ctx.userId,
			entityType: 'lead',
			entityId: current.leadId,
			action: `tour_${input.status}`,
			summary: `Tour with ${name} at ${current.propertyName} ${label === 'no-show' ? 'marked no-show' : label}`,
			data: { tourId: id }
		});
	}
	if (Object.keys(input).length) {
		await emit({
			orgId: ctx.orgId,
			actorId: ctx.userId,
			entityType: 'tour',
			entityId: id,
			action: 'updated',
			summary: `Updated tour at ${current.propertyName}`,
			data: { status: t!.status, startsAt: t!.startsAt.toISOString() }
		});
	}
	return t!;
}

// ── Attention ───────────────────────────────────────────────────────────────

function dayBounds(tz: string, now = new Date()) {
	const today = localDate(now, tz);
	const start = zonedToUtc(today, 0, tz);
	return { today, start, end: new Date(start.getTime() + 24 * 60 * MINUTE) };
}

/** What needs doing today: new leads, follow-ups that are due and today's tours. */
export async function leasingAttention(orgId: string, ctx?: OrgContext) {
	const { timezone } = await getLeasingSettings(orgId);
	const { today, start, end } = dayBounds(timezone);
	const [followUps, newLeads, tours] = await Promise.all([
		db
			.select({
				id: lead.id,
				firstName: lead.firstName,
				lastName: lead.lastName,
				stage: lead.stage,
				nextFollowUpOn: lead.nextFollowUpOn,
				propertyName: property.name
			})
			.from(lead)
			.leftJoin(property, eq(property.id, lead.propertyId))
			.where(
				and(
					eq(lead.organizationId, orgId),
					ctx?.propertyIds ? inArray(lead.propertyId, ctx.propertyIds) : undefined,
					inArray(lead.stage, OPEN_LEAD_STAGES),
					lte(lead.nextFollowUpOn, today)
				)
			)
			.orderBy(asc(lead.nextFollowUpOn)),
		db
			.select({ n: sql<number>`count(*)`.mapWith(Number) })
			.from(lead)
			.where(
				and(
					eq(lead.organizationId, orgId),
					ctx?.propertyIds ? inArray(lead.propertyId, ctx.propertyIds) : undefined,
					eq(lead.stage, 'new')
				)
			),
		toursQuery().where(
			and(
				eq(tour.organizationId, orgId),
				ctx?.propertyIds ? inArray(tour.propertyId, ctx.propertyIds) : undefined,
				eq(tour.status, 'scheduled'),
				gte(tour.startsAt, start),
				lt(tour.startsAt, end)
			)
		)
	]);
	return {
		today,
		timezone,
		followUps,
		newLeads: newLeads[0]?.n ?? 0,
		tours: ctx?.perms && !allows(ctx.perms, 'tours', 'read') ? [] : tours
	};
}

export async function leasingBadge(orgId: string, ctx?: OrgContext) {
	const { today } = dayBounds((await getLeasingSettings(orgId)).timezone);
	const [row] = await db
		.select({ n: sql<number>`count(*)`.mapWith(Number) })
		.from(lead)
		.where(
			and(
				eq(lead.organizationId, orgId),
				ctx?.propertyIds ? inArray(lead.propertyId, ctx.propertyIds) : undefined,
				sql`(${lead.stage} = 'new' or (${inArray(lead.stage, OPEN_LEAD_STAGES)} and ${lead.nextFollowUpOn} <= ${today}))`
			)
		);
	return row?.n ?? 0;
}

// ── Settings ────────────────────────────────────────────────────────────────

export type LeasingSettings = TourHours & { selfBooking: boolean; configured: boolean };

export async function getLeasingSettings(orgId: string): Promise<LeasingSettings> {
	const s = leasingSettings;
	const [row] = await db
		.select({
			selfBooking: s.selfBooking,
			timezone: s.timezone,
			tourDays: s.tourDays,
			tourStart: s.tourStart,
			tourEnd: s.tourEnd,
			slotMinutes: s.slotMinutes,
			noticeHours: s.noticeHours
		})
		.from(s)
		.where(eq(s.organizationId, orgId));
	return row
		? { ...row, configured: true }
		: { ...TOUR_DEFAULTS, selfBooking: false, configured: false };
}

export async function saveLeasingSettings(orgId: string, input: Out<typeof leasingSettingsInput>) {
	if (!isValidTimezone(input.timezone)) error(400, 'Unknown time zone');
	if (input.tourEnd < input.tourStart + input.slotMinutes)
		error(400, 'Tour hours must end at least one slot after they start');
	if (input.selfBooking && !input.tourDays.length) error(400, 'Pick at least one day for tours');
	const values = { ...input, tourDays: [...new Set(input.tourDays)].sort() };
	await db
		.insert(leasingSettings)
		.values({ organizationId: orgId, ...values })
		.onConflictDoUpdate({ target: leasingSettings.organizationId, set: values });
}

/** Records the workspace's time zone the first time someone opens Leasing, if none is set. */
export async function initLeasingTimezone(orgId: string, timezone: string) {
	if (!isValidTimezone(timezone)) return;
	await db
		.insert(leasingSettings)
		.values({ organizationId: orgId, timezone })
		.onConflictDoNothing();
}

// ── Property marketing ──────────────────────────────────────────────────────

const publishedCount = sql<number>`(
	select count(*) from "listing" inner join "unit" on "unit"."id" = "listing"."unit_id"
	where "unit"."property_id" = "property"."id" and "listing"."status" = 'published'
)`.mapWith(Number);

export async function getPropertyMarketing(orgId: string, id: string) {
	const [row] = await db
		.select({
			id: property.id,
			publicPage: property.publicPage,
			marketingDescription: property.marketingDescription,
			amenities: property.amenities,
			publishedListings: publishedCount
		})
		.from(property)
		.where(and(eq(property.organizationId, orgId), eq(property.id, id)));
	if (!row) error(404, 'Property not found');
	return row;
}

export async function updatePropertyMarketing(
	ctx: OrgContext,
	{ id, ...input }: Out<typeof propertyMarketingInput>
) {
	const [row] = await db
		.update(property)
		.set(input)
		.where(and(eq(property.organizationId, ctx.orgId), eq(property.id, id)))
		.returning({ id: property.id, name: property.name });
	if (!row) error(404, 'Property not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'property',
		entityId: id,
		action: 'updated',
		summary: `Updated marketing info for ${row.name}`
	});
}

// ── Waitlist ────────────────────────────────────────────────────────────────

async function listingHome(orgId: string, listingId: string) {
	const [l] = await db
		.select({
			id: listing.id,
			title: listing.title,
			status: listing.status,
			propertyId: unit.propertyId,
			bedrooms: unit.bedrooms
		})
		.from(listing)
		.innerJoin(unit, eq(unit.id, listing.unitId))
		.where(and(eq(listing.organizationId, orgId), eq(listing.id, listingId)));
	if (!l) error(404, 'Listing not found');
	return l;
}

/** Open, waitlisted leads who'd want this listing, and whether they were already emailed about it. */
export async function waitlistForListing(orgId: string, listingId: string) {
	const home = await listingHome(orgId, listingId);
	const rows = await db
		.select({
			id: lead.id,
			firstName: lead.firstName,
			lastName: lead.lastName,
			email: lead.email,
			propertyId: lead.propertyId,
			bedrooms: lead.bedrooms,
			waitlistedAt: lead.waitlistedAt
		})
		.from(lead)
		.where(
			and(
				eq(lead.organizationId, orgId),
				eq(lead.waitlist, true),
				inArray(lead.stage, OPEN_LEAD_STAGES)
			)
		)
		.orderBy(asc(lead.waitlistedAt));
	const matches = rows.filter((r) => matchesWaitlist(r, home));
	const emails = matches.map((m) => m.email).filter((e): e is string => !!e);
	const sent = emails.length
		? await db
				.select({ recipient: notificationLog.recipient })
				.from(notificationLog)
				.where(
					and(
						eq(notificationLog.organizationId, orgId),
						eq(notificationLog.kind, 'waitlist.opening'),
						eq(notificationLog.entityId, listingId),
						inArray(notificationLog.recipient, emails)
					)
				)
		: [];
	const notified = new Set(sent.map((s) => s.recipient));
	return matches.map((m) => ({ ...m, notified: !!m.email && notified.has(m.email) }));
}

/** Emails everyone on the matching waitlist who hasn't heard about this listing yet. */
export async function emailWaitlist(ctx: OrgContext, listingId: string) {
	assertNotDemo();
	const home = await listingHome(ctx.orgId, listingId);
	if (home.status !== 'published') error(409, 'Publish the listing first');
	const url = `${appOrigin()}/l/${ctx.org.slug}/${listingId}`;
	let sent = 0;
	for (const w of await waitlistForListing(ctx.orgId, listingId)) {
		if (!w.email || w.notified) continue;
		if (
			!(await notifyWaitlistOpening(
				ctx.orgId,
				listingId,
				{ ...w, email: w.email },
				home.title,
				url
			))
		)
			continue;
		sent++;
		const current = await leadRow(ctx.orgId, w.id);
		const stage = advanceStage(current.stage, 'contacted');
		await db.insert(leadNote).values({
			organizationId: ctx.orgId,
			leadId: w.id,
			kind: 'email',
			body: `Emailed about “${home.title}” from the waitlist`,
			authorId: ctx.userId
		});
		await db
			.update(lead)
			.set({ stage, lastContactedAt: new Date(), listingId: current.listingId ?? listingId })
			.where(eq(lead.id, w.id));
		await stageChanged(ctx.orgId, ctx.userId, current, current.stage, stage);
	}
	return { sent };
}

// ── Applications ────────────────────────────────────────────────────────────

/** Links a new rental application to the applicant's lead, creating one if needed. */
export async function leadFromApplication(
	orgId: string,
	app: {
		id: string;
		firstName: string;
		lastName: string;
		email: string;
		phone: string | null;
		moveInDate: string | null;
	},
	l: { id: string; title: string; unitId: string }
) {
	const [u] = await db
		.select({ propertyId: unit.propertyId, bedrooms: unit.bedrooms })
		.from(unit)
		.where(eq(unit.id, l.unitId));
	await captureLead(
		orgId,
		{
			firstName: app.firstName,
			lastName: app.lastName,
			email: app.email,
			phone: app.phone,
			source: 'application',
			propertyId: u?.propertyId ?? null,
			listingId: l.id,
			moveInDate: app.moveInDate,
			bedrooms: u?.bedrooms ?? null,
			waitlist: false
		},
		{
			note: { kind: 'inquiry', body: `Applied for “${l.title}”` },
			advanceTo: 'applied',
			applicationId: app.id,
			consent: true
		}
	);
}

/** Marks the lead behind an approved application as leased. */
export async function leadApplicationApproved(
	ctx: OrgContext,
	applicationId: string,
	tenantId: string
) {
	const [current] = await db
		.select()
		.from(lead)
		.where(and(eq(lead.organizationId, ctx.orgId), eq(lead.applicationId, applicationId)));
	if (!current) return;
	const stage = advanceStage(current.stage, 'leased');
	await db
		.update(lead)
		.set({ stage, tenantId, waitlist: false, nextFollowUpOn: null })
		.where(eq(lead.id, current.id));
	await stageChanged(ctx.orgId, ctx.userId, current, current.stage, stage);
}

// ── Public pages ────────────────────────────────────────────────────────────

const MAX_PUBLIC_PER_IP_PER_HOUR = 10;
const recent = new Map<string, number[]>();

function rateLimit(ip: string | null) {
	if (!ip) return;
	const now = Date.now();
	const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
	if (hits.length >= MAX_PUBLIC_PER_IP_PER_HOUR)
		error(429, 'Too many requests from this connection. Try again in an hour.');
	recent.set(ip, [...hits, now]);
	if (recent.size > 10_000) recent.clear();
}

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

/** A property whose public page is on, or that has a published listing. Staff see any. */
async function visibleProperty(orgId: string, id: string, staff: boolean) {
	const [p] = await db
		.select({
			id: property.id,
			name: property.name,
			type: property.type,
			addressLine1: property.addressLine1,
			city: property.city,
			region: property.region,
			postalCode: property.postalCode,
			marketingDescription: property.marketingDescription,
			amenities: property.amenities,
			publicPage: property.publicPage,
			publishedListings: publishedCount
		})
		.from(property)
		.where(
			and(eq(property.organizationId, orgId), eq(property.id, id), isNull(property.archivedAt))
		);
	const visible = !!p && (p.publicPage || p.publishedListings > 0);
	if (!p || (!visible && !staff)) error(404, 'Not found');
	return { ...p, visible };
}

const firstPhoto = sql<string | null>`(
	select ${document.id} from ${document}
	where ${document.entityType} = 'listing' and ${document.entityId} = ${listing.id}
		and ${document.contentType} like 'image/%'
	order by ${document.createdAt} limit 1
)`;

/** Properties with a public page, for the workspace's public index. */
export async function publicProperties(orgId: string) {
	return db
		.select({
			id: property.id,
			name: property.name,
			city: property.city,
			region: property.region,
			publishedListings: publishedCount
		})
		.from(property)
		.where(
			and(
				eq(property.organizationId, orgId),
				isNull(property.archivedAt),
				sql`(${property.publicPage} or ${publishedCount} > 0)`
			)
		)
		.orderBy(asc(property.name));
}

export async function publicProperty(slug: string, id: string, viewerOrgId: string | null) {
	const org = await orgBySlug(slug);
	const staff = viewerOrgId === org.id;
	const p = await visibleProperty(org.id, id, staff);
	const homes = await db
		.select({
			id: listing.id,
			title: listing.title,
			rentAmount: listing.rentAmount,
			currency: listing.currency,
			availableOn: listing.availableOn,
			photoId: firstPhoto,
			unitName: unit.name,
			bedrooms: unit.bedrooms,
			bathrooms: unit.bathrooms,
			areaSqft: unit.areaSqft
		})
		.from(listing)
		.innerJoin(unit, eq(unit.id, listing.unitId))
		.where(
			and(
				eq(listing.organizationId, org.id),
				eq(unit.propertyId, p.id),
				eq(listing.status, 'published')
			)
		)
		.orderBy(asc(listing.availableOn), asc(listing.rentAmount));
	const settings = await getLeasingSettings(org.id);
	const { publicPage: _p, publishedListings: _n, visible, ...rest } = p;
	return {
		org,
		preview: !visible,
		property: rest,
		listings: homes,
		selfBooking: settings.selfBooking,
		timezone: settings.timezone
	};
}

async function busyTours(
	propertyId: string,
	from: Date,
	to: Date,
	tx: Pick<typeof db, 'select'> = db
) {
	const rows = await tx
		.select({ startsAt: tour.startsAt, durationMinutes: tour.durationMinutes })
		.from(tour)
		.where(
			and(
				eq(tour.propertyId, propertyId),
				eq(tour.status, 'scheduled'),
				gte(tour.startsAt, new Date(from.getTime() - 4 * 60 * MINUTE)),
				lte(tour.startsAt, to)
			)
		);
	return rows.map((r) => ({
		start: r.startsAt,
		end: new Date(r.startsAt.getTime() + r.durationMinutes * MINUTE)
	}));
}

export async function publicTourSlots(
	{ orgSlug, propertyId }: Out<typeof tourSlotsInput>,
	viewerOrgId: string | null
) {
	const org = await orgBySlug(orgSlug);
	await visibleProperty(org.id, propertyId, viewerOrgId === org.id);
	const settings = await getLeasingSettings(org.id);
	if (!settings.selfBooking) return { timezone: settings.timezone, days: [] };
	const now = new Date();
	const busy = await busyTours(propertyId, now, new Date(now.getTime() + 16 * 86400_000));
	return { timezone: settings.timezone, days: tourSlots(settings, now, busy, 14) };
}

async function publicListingAt(orgId: string, listingId: string, propertyId: string | null) {
	const home = await listingHome(orgId, listingId).catch(() => null);
	if (!home || home.status !== 'published' || (propertyId && home.propertyId !== propertyId))
		error(404, 'This home is no longer listed');
	return home;
}

type Meta = { ip: string | null; userAgent: string | null };

/** "Contact us" or "join the waitlist" from a public property or listing page. */
export async function submitInquiry(input: Out<typeof inquiryInput>, meta: Meta) {
	if (input.website) return { ok: true };
	rateLimit(meta.ip);
	const org = await orgBySlug(input.orgSlug);
	let propertyId = input.propertyId ?? null;
	if (propertyId) await visibleProperty(org.id, propertyId, false);
	let listingTitle: string | null = null;
	if (input.listingId) {
		const home = await publicListingAt(org.id, input.listingId, propertyId);
		propertyId = home.propertyId;
		listingTitle = home.title;
	}
	const { lead: l, noteId } = await captureLead(
		org.id,
		{
			firstName: input.firstName,
			lastName: input.lastName,
			email: input.email,
			phone: input.phone,
			source: input.listingId ? 'listing' : 'website',
			propertyId,
			listingId: input.listingId ?? null,
			moveInDate: input.moveInDate,
			bedrooms: input.bedrooms,
			message: input.message,
			waitlist: input.waitlist
		},
		{
			note: {
				kind: 'inquiry',
				body:
					input.message ||
					(input.waitlist ? 'Joined the waitlist' : `Asked about ${listingTitle ?? 'availability'}`)
			},
			consent: true
		}
	);
	const name = leadName(l);
	await notifyLeadActivity(
		org.id,
		noteId!,
		l,
		input.waitlist ? `${name} joined your waitlist` : `New inquiry from ${name}`,
		input.message
			? `“${input.message.slice(0, 500)}”`
			: `${name} reached out from your public page.`
	);
	return { ok: true };
}

/** A tour the prospect books into an open slot from a public page. */
export async function bookTour(input: Out<typeof tourBookingInput>, meta: Meta) {
	if (input.website) return { ok: true, when: '', emailed: false };
	rateLimit(meta.ip);
	const org = await orgBySlug(input.orgSlug);
	const p = await visibleProperty(org.id, input.propertyId, false);
	const settings = await getLeasingSettings(org.id);
	if (!settings.selfBooking) error(409, 'Online tour booking is off. Send a message instead.');
	if (input.listingId) await publicListingAt(org.id, input.listingId, p.id);
	const startsAt = new Date(input.startsAt);
	if (!isBookable(settings, startsAt, new Date(), []))
		error(409, 'Pick one of the available times');

	const { lead: l } = await captureLead(
		org.id,
		{
			firstName: input.firstName,
			lastName: input.lastName,
			email: input.email,
			phone: input.phone,
			source: input.listingId ? 'listing' : 'website',
			propertyId: p.id,
			listingId: input.listingId ?? null,
			message: input.message,
			waitlist: false
		},
		{
			note: input.message ? { kind: 'inquiry', body: input.message } : undefined,
			consent: true
		}
	);
	if (l.stage === 'leased' || l.stage === 'lost') error(409, 'Contact us to book a tour');

	const t = await db.transaction(async (tx) => {
		// Serialises bookings per property so two people can't take the same slot.
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tour:${p.id}`}))`);
		const busy = await busyTours(
			p.id,
			startsAt,
			new Date(startsAt.getTime() + settings.slotMinutes * MINUTE),
			tx
		);
		if (!isBookable(settings, startsAt, new Date(), busy))
			error(409, 'That time was just taken. Pick another.');
		const [row] = await tx
			.insert(tour)
			.values({
				organizationId: org.id,
				leadId: l.id,
				propertyId: p.id,
				listingId: input.listingId ?? null,
				startsAt,
				durationMinutes: settings.slotMinutes,
				agentId: l.assignedTo,
				selfBooked: true
			})
			.returning();
		return row!;
	});
	await tourCreated(org.id, null, l, t, p.name);
	const when = formatTourTimeZoned(startsAt, settings.timezone);
	// The public demo must not send email to addresses typed in by strangers.
	if (!isDemo())
		await notifyTourConfirmed(org.id, t.id, { ...l, email: input.email }, when, p.name);
	await notifyLeadActivity(
		org.id,
		t.id,
		l,
		`Tour booked: ${leadName(l)}, ${when}`,
		`${leadName(l)} booked a tour of ${p.name} for ${when}.`
	);
	return { ok: true, when, emailed: !isDemo() };
}
