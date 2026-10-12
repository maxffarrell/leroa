import { and, asc, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	asset,
	maintenanceTicket,
	property,
	tenant,
	ticketNote,
	unit,
	user,
	vendor
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { ticketInput, ticketNoteInput, ticketUpdate } from '#lib/schemas.ts';
import { isDemo } from '#lib/server/demo-mode.ts';
import { emit } from './events.ts';
import { notifyTicketEmergency, notifyTicketStatus, notifyWorkOrder } from './notifications.ts';
import { hasFeature } from '#lib/server/features.ts';
import { intakeTicket, type IntakeDecision } from '#lib/server/ai/decisions.ts';
import { entityImages } from './documents.ts';
import { assertAsset } from './assets.ts';
import { assertVendor } from './vendors.ts';
import { workOrderToken } from './work-orders.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const dupTicket = alias(maintenanceTicket, 'dup_ticket');

export async function listTickets(
	orgId: string,
	opts: { propertyId?: string; vendorId?: string; assetId?: string; unitId?: string } = {}
) {
	return db
		.select({
			id: maintenanceTicket.id,
			number: maintenanceTicket.number,
			title: maintenanceTicket.title,
			description: maintenanceTicket.description,
			status: maintenanceTicket.status,
			priority: maintenanceTicket.priority,
			dueDate: maintenanceTicket.dueDate,
			vendorId: vendor.id,
			vendorName: vendor.name,
			vendorEmail: vendor.email,
			vendorSentAt: maintenanceTicket.vendorSentAt,
			costAmount: maintenanceTicket.costAmount,
			createdAt: maintenanceTicket.createdAt,
			updatedAt: maintenanceTicket.updatedAt,
			propertyId: property.id,
			propertyName: property.name,
			unitId: unit.id,
			unitName: unit.name,
			tenantId: tenant.id,
			tenantFirstName: tenant.firstName,
			tenantLastName: tenant.lastName,
			assigneeId: user.id,
			assigneeName: user.name,
			assetId: asset.id,
			assetName: asset.name,
			scheduleId: maintenanceTicket.scheduleId,
			duplicateOf: maintenanceTicket.duplicateOf,
			dupNumber: dupTicket.number,
			dupTitle: dupTicket.title
		})
		.from(maintenanceTicket)
		.innerJoin(property, eq(property.id, maintenanceTicket.propertyId))
		.leftJoin(unit, eq(unit.id, maintenanceTicket.unitId))
		.leftJoin(tenant, eq(tenant.id, maintenanceTicket.tenantId))
		.leftJoin(user, eq(user.id, maintenanceTicket.assigneeId))
		.leftJoin(vendor, eq(vendor.id, maintenanceTicket.vendorId))
		.leftJoin(asset, eq(asset.id, maintenanceTicket.assetId))
		.leftJoin(dupTicket, eq(dupTicket.id, maintenanceTicket.duplicateOf))
		.where(
			and(
				eq(maintenanceTicket.organizationId, orgId),
				opts.propertyId ? eq(maintenanceTicket.propertyId, opts.propertyId) : undefined,
				opts.vendorId ? eq(maintenanceTicket.vendorId, opts.vendorId) : undefined,
				opts.assetId ? eq(maintenanceTicket.assetId, opts.assetId) : undefined,
				opts.unitId ? eq(maintenanceTicket.unitId, opts.unitId) : undefined
			)
		)
		.orderBy(
			sql`case ${maintenanceTicket.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
			desc(maintenanceTicket.createdAt)
		);
}

export type Ticket = Awaited<ReturnType<typeof listTickets>>[number];

export async function createTicket(
	ctx: { orgId: string; userId: string | null },
	input: Out<typeof ticketInput> & { scheduleId?: string | null }
) {
	const p = await db.query.property.findFirst({
		where: (p, { and, eq }) => and(eq(p.organizationId, ctx.orgId), eq(p.id, input.propertyId))
	});
	if (!p) error(404, 'Property not found');
	if (input.vendorId) await assertVendor(ctx.orgId, input.vendorId);
	if (input.assetId) await assertAsset(ctx.orgId, input.assetId);
	const intake = hasFeature('ai')
		? await intakeTicket(ctx.orgId, {
				title: input.title,
				description: input.description,
				unitId: input.unitId ?? null,
				propertyId: input.propertyId
			})
		: null;
	const created = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.orgId}))`);
		const [{ n }] = (await tx
			.select({ n: max(maintenanceTicket.number) })
			.from(maintenanceTicket)
			.where(eq(maintenanceTicket.organizationId, ctx.orgId))) as [{ n: number | null }];
		const [t] = await tx
			.insert(maintenanceTicket)
			.values({
				...input,
				organizationId: ctx.orgId,
				number: (n ?? 0) + 1,
				...(intake?.emergency && input.priority !== 'urgent' ? { priority: 'urgent' } : {}),
				...(intake?.duplicateOf ? { duplicateOf: intake.duplicateOf } : {}),
				closedAt: input.status === 'done' || input.status === 'cancelled' ? new Date() : null
			})
			.returning();
		return t!;
	});
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'maintenance',
		entityId: created.id,
		action: 'created',
		summary: `#${created.number} ${created.title} · ${p.name}`,
		data: { priority: created.priority }
	});
	if (intake && (intake.emergency || intake.duplicateOf))
		await applyTicketIntake(ctx.orgId, created, intake, p.name);
	return created;
}

/**
 * Records an intake decision on a freshly created request: an internal note for
 * each flag, plus a manager alert when it reads like an emergency. Shared by the
 * staff flow and the tenant portal flow.
 */
export async function applyTicketIntake(
	orgId: string,
	t: Pick<
		typeof maintenanceTicket.$inferSelect,
		'id' | 'organizationId' | 'number' | 'title' | 'status' | 'tenantId'
	>,
	intake: IntakeDecision,
	place: string
) {
	if (intake.emergency) {
		await db.insert(ticketNote).values({
			organizationId: orgId,
			ticketId: t.id,
			authorType: 'staff',
			authorName: 'Leroa AI',
			body: `Flagged as a possible emergency and moved to urgent.${intake.reason ? ` ${intake.reason}` : ''}`,
			internal: true
		});
		void notifyTicketEmergency(t, place, intake.reason).catch((err) =>
			console.error('emergency alert failed', err)
		);
	}
	if (intake.duplicateOf) {
		const [d] = await db
			.select({ number: maintenanceTicket.number })
			.from(maintenanceTicket)
			.where(eq(maintenanceTicket.id, intake.duplicateOf));
		await db.insert(ticketNote).values({
			organizationId: orgId,
			ticketId: t.id,
			authorType: 'staff',
			authorName: 'Leroa AI',
			body: `Possible duplicate of #${d?.number ?? '?'} — ${intake.duplicateReason ?? 'similar wording'}.`,
			internal: true
		});
	}
}

export async function updateTicket(ctx: OrgContext, { id, ...data }: Out<typeof ticketUpdate>) {
	const closing = data.status === 'done' || data.status === 'cancelled';
	if (data.vendorId) await assertVendor(ctx.orgId, data.vendorId);
	if (data.assetId) await assertAsset(ctx.orgId, data.assetId);
	const [t] = await db
		.update(maintenanceTicket)
		.set({
			...data,
			...(data.status ? { closedAt: closing ? new Date() : null } : {}),
			// A new vendor hasn't been sent anything yet.
			...(data.vendorId !== undefined
				? {
						vendorSentAt: sql`case when ${maintenanceTicket.vendorId} is distinct from ${data.vendorId}::text then null else ${maintenanceTicket.vendorSentAt} end`
					}
				: {})
		})
		.where(and(eq(maintenanceTicket.organizationId, ctx.orgId), eq(maintenanceTicket.id, id)))
		.returning();
	if (!t) error(404, 'Ticket not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'maintenance',
		entityId: id,
		action: 'updated',
		summary: data.status
			? `#${t.number} moved to ${data.status.replace('_', ' ')}`
			: `#${t.number} updated`
	});
	if (data.status)
		void notifyTicketStatus(t).catch((err) => console.error('ticket email failed', err));
	return t;
}

export async function openTicketCount(orgId: string) {
	const [r] = await db
		.select({ n: sql<number>`count(*)`.mapWith(Number) })
		.from(maintenanceTicket)
		.where(
			and(
				eq(maintenanceTicket.organizationId, orgId),
				inArray(maintenanceTicket.status, ['open', 'in_progress', 'on_hold'])
			)
		);
	return r?.n ?? 0;
}

async function ticketInOrg(orgId: string, id: string) {
	const [t] = await db
		.select()
		.from(maintenanceTicket)
		.where(and(eq(maintenanceTicket.organizationId, orgId), eq(maintenanceTicket.id, id)));
	if (!t) error(404, 'Ticket not found');
	return t;
}

/** Notes (including internal ones) and photos for the staff ticket sheet. */
export async function ticketActivity(orgId: string, id: string) {
	await ticketInOrg(orgId, id);
	const [notes, photos] = await Promise.all([
		db
			.select({
				id: ticketNote.id,
				authorType: ticketNote.authorType,
				authorName: ticketNote.authorName,
				body: ticketNote.body,
				internal: ticketNote.internal,
				createdAt: ticketNote.createdAt
			})
			.from(ticketNote)
			.where(and(eq(ticketNote.organizationId, orgId), eq(ticketNote.ticketId, id)))
			.orderBy(asc(ticketNote.createdAt)),
		entityImages(orgId, 'maintenance', id)
	]);
	return { notes, photos };
}

export async function addTicketNote(ctx: OrgContext, input: Out<typeof ticketNoteInput>) {
	const t = await ticketInOrg(ctx.orgId, input.ticketId);
	const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.userId));
	const [note] = await db
		.insert(ticketNote)
		.values({
			organizationId: ctx.orgId,
			ticketId: t.id,
			authorType: 'staff',
			authorId: ctx.userId,
			authorName: me?.name || 'Staff',
			body: input.body,
			internal: input.internal
		})
		.returning();
	await db
		.update(maintenanceTicket)
		.set({ updatedAt: new Date() })
		.where(eq(maintenanceTicket.id, t.id));
	return note!;
}

async function assignedVendor(orgId: string, id: string) {
	const [row] = await db
		.select({
			ticket: maintenanceTicket,
			vendor: { id: vendor.id, name: vendor.name, email: vendor.email },
			propertyName: property.name,
			unitName: unit.name
		})
		.from(maintenanceTicket)
		.innerJoin(property, eq(property.id, maintenanceTicket.propertyId))
		.leftJoin(unit, eq(unit.id, maintenanceTicket.unitId))
		.leftJoin(vendor, eq(vendor.id, maintenanceTicket.vendorId))
		.where(and(eq(maintenanceTicket.organizationId, orgId), eq(maintenanceTicket.id, id)));
	if (!row) error(404, 'Ticket not found');
	if (!row.vendor) error(400, 'Assign a vendor first');
	return { ...row, vendor: row.vendor };
}

export async function workOrderPath(orgId: string, id: string) {
	const { ticket, vendor: v } = await assignedVendor(orgId, id);
	return `/w/${workOrderToken(ticket.id, v.id)}`;
}

/** Emails the assigned vendor their work-order link. */
export async function sendWorkOrder(ctx: OrgContext, id: string) {
	const row = await assignedVendor(ctx.orgId, id);
	const t = row.ticket;
	if (!row.vendor.email) error(400, `Add an email address for ${row.vendor.name} first`);
	if (t.status === 'done' || t.status === 'cancelled') error(409, 'This request is closed');
	if (isDemo()) error(403, 'Emailing vendors is turned off in the public demo');
	const place = row.unitName ? `${row.propertyName}, ${row.unitName}` : row.propertyName;
	await notifyWorkOrder(
		ctx.orgId,
		t,
		{ name: row.vendor.name, email: row.vendor.email },
		place,
		`/w/${workOrderToken(t.id, row.vendor.id)}`
	);
	await db
		.update(maintenanceTicket)
		.set({ vendorSentAt: new Date() })
		.where(eq(maintenanceTicket.id, t.id));
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'maintenance',
		entityId: t.id,
		action: 'updated',
		summary: `#${t.number} sent to ${row.vendor.name}`,
		data: { vendorId: row.vendor.id }
	});
}
