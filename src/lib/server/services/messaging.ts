import { and, count, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	announcement,
	lease,
	leaseTenant,
	message,
	messageThread,
	organization,
	property,
	tenant,
	unit,
	user
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { announcementCreate, messageSend } from '#lib/schemas.ts';
import { isDemo } from '#lib/server/demo-mode.ts';
import { tenantName } from '#lib/format.ts';
import { emit } from './events.ts';
import { portalTenants } from './portal.ts';
import { notifyAnnouncement, notifyResidentMessage, notifyStaffMessage } from './notifications.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;
type Author = { type: 'staff' | 'tenant'; id: string | null; name: string };

const PREVIEW_LENGTH = 140;
const THREAD_LIMIT = 300;
const TENANT_MESSAGES_PER_HOUR = 30;
const PORTAL_ANNOUNCEMENT_DAYS = 180;

const preview = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);

const staffUnread = sql<boolean>`(${messageThread.lastAuthorType} = 'tenant' and (${messageThread.staffReadAt} is null or ${messageThread.staffReadAt} < ${messageThread.lastMessageAt}))`;

/** The unit and property of each tenant's most recent active or draft lease. */
function homes() {
	return db
		.select({
			tenantId: leaseTenant.tenantId,
			unitName: sql<string>`(array_agg(${unit.name} order by ${lease.startDate} desc))[1]`.as(
				'unit_name'
			),
			propertyName:
				sql<string>`(array_agg(${property.name} order by ${lease.startDate} desc))[1]`.as(
					'property_name'
				)
		})
		.from(leaseTenant)
		.innerJoin(
			lease,
			and(eq(lease.id, leaseTenant.leaseId), inArray(lease.status, ['active', 'draft']))
		)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.groupBy(leaseTenant.tenantId)
		.as('home');
}

export async function listThreads(orgId: string) {
	const home = homes();
	const rows = await db
		.select({
			id: messageThread.id,
			tenantId: messageThread.tenantId,
			lastMessageAt: messageThread.lastMessageAt,
			lastAuthorType: messageThread.lastAuthorType,
			preview: messageThread.preview,
			unread: staffUnread,
			kind: tenant.kind,
			firstName: tenant.firstName,
			lastName: tenant.lastName,
			companyName: tenant.companyName,
			unitName: home.unitName,
			propertyName: home.propertyName
		})
		.from(messageThread)
		.innerJoin(tenant, eq(tenant.id, messageThread.tenantId))
		.leftJoin(home, eq(home.tenantId, messageThread.tenantId))
		.where(eq(messageThread.organizationId, orgId))
		.orderBy(desc(messageThread.lastMessageAt))
		.limit(THREAD_LIMIT);
	return rows.map(({ kind, firstName, lastName, companyName, ...r }) => ({
		...r,
		name: tenantName({ kind, firstName, lastName, companyName })
	}));
}

export async function unreadThreadCount(orgId: string) {
	const [row] = await db
		.select({ n: count() })
		.from(messageThread)
		.where(and(eq(messageThread.organizationId, orgId), staffUnread));
	return row?.n ?? 0;
}

async function orgTenant(orgId: string, tenantId: string) {
	const t = await db.query.tenant.findFirst({
		where: (t, { and, eq }) => and(eq(t.organizationId, orgId), eq(t.id, tenantId))
	});
	if (!t) error(404, 'Tenant not found');
	return t;
}

async function threadMessages(threadId: string) {
	const rows = await db
		.select({
			id: message.id,
			authorType: message.authorType,
			authorId: message.authorId,
			authorName: message.authorName,
			body: message.body,
			createdAt: message.createdAt
		})
		.from(message)
		.where(eq(message.threadId, threadId))
		.orderBy(desc(message.createdAt))
		.limit(500);
	return rows.reverse();
}

/** A tenant's conversation, marked read for staff. `lastReadAt` is the previous read time. */
export async function getThread(orgId: string, tenantId: string) {
	const t = await orgTenant(orgId, tenantId);
	const home = homes();
	const [where] = await db
		.select({ unitName: home.unitName, propertyName: home.propertyName })
		.from(home)
		.where(eq(home.tenantId, tenantId));
	const thread = await db.query.messageThread.findFirst({
		where: (m, { eq }) => eq(m.tenantId, tenantId)
	});
	const messages = thread ? await threadMessages(thread.id) : [];
	if (thread && thread.lastAuthorType === 'tenant')
		await db
			.update(messageThread)
			.set({ staffReadAt: new Date() })
			.where(eq(messageThread.id, thread.id));
	return {
		tenant: {
			id: t.id,
			name: tenantName(t),
			email: t.email,
			portalLinked: !!t.portalUserId,
			unitName: where?.unitName ?? null,
			propertyName: where?.propertyName ?? null
		},
		lastReadAt: thread?.staffReadAt ?? null,
		residentReadAt: thread?.tenantReadAt ?? null,
		messages
	};
}

export async function postMessage(
	orgId: string,
	tenantId: string,
	author: Author,
	body: string,
	now = new Date()
) {
	const readField = author.type === 'staff' ? 'staffReadAt' : 'tenantReadAt';
	const [thread] = await db
		.insert(messageThread)
		.values({
			organizationId: orgId,
			tenantId,
			lastMessageAt: now,
			lastAuthorType: author.type,
			preview: preview(body),
			[readField]: now
		})
		.onConflictDoUpdate({
			target: messageThread.tenantId,
			set: {
				lastMessageAt: now,
				lastAuthorType: author.type,
				preview: preview(body),
				[readField]: now
			}
		})
		.returning();
	const [m] = await db
		.insert(message)
		.values({
			organizationId: orgId,
			threadId: thread!.id,
			authorType: author.type,
			authorId: author.id,
			authorName: author.name,
			body,
			createdAt: now
		})
		.returning();
	await emit({
		orgId,
		actorId: author.id,
		entityType: 'message',
		entityId: m!.id,
		action: 'created',
		summary:
			author.type === 'staff' ? `Message sent by ${author.name}` : `${author.name} sent a message`,
		data: { tenantId, authorType: author.type }
	});
	return m!;
}

export async function sendStaffMessage(ctx: OrgContext, input: Out<typeof messageSend>) {
	const t = await orgTenant(ctx.orgId, input.tenantId);
	const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.userId));
	const m = await postMessage(
		ctx.orgId,
		t.id,
		{ type: 'staff', id: ctx.userId, name: me?.name || ctx.org.name },
		input.body
	);
	if (!isDemo()) await notifyResidentMessage(ctx.orgId, m, { name: tenantName(t), email: t.email });
	return m;
}

/** Conversations for each tenant record linked to this login, marked read for the resident. */
export async function portalMessages(userId: string) {
	const tenants = await portalTenants(userId);
	if (!tenants.length) return [];
	const threads = await db
		.select()
		.from(messageThread)
		.where(
			inArray(
				messageThread.tenantId,
				tenants.map((t) => t.tenant.id)
			)
		);
	const out = [];
	for (const { tenant: t, orgName } of tenants) {
		const thread = threads.find((x) => x.tenantId === t.id);
		out.push({
			tenantId: t.id,
			orgName,
			lastReadAt: thread?.tenantReadAt ?? null,
			messages: thread ? await threadMessages(thread.id) : []
		});
		if (thread && thread.lastAuthorType === 'staff')
			await db
				.update(messageThread)
				.set({ tenantReadAt: new Date() })
				.where(eq(messageThread.id, thread.id));
	}
	return out;
}

export async function sendPortalMessage(userId: string, input: Out<typeof messageSend>) {
	const linked = (await portalTenants(userId)).find((t) => t.tenant.id === input.tenantId);
	if (!linked) error(404, 'Conversation not found');
	const t = linked.tenant;
	const [recent] = await db
		.select({ n: count() })
		.from(message)
		.innerJoin(messageThread, eq(messageThread.id, message.threadId))
		.where(
			and(
				eq(messageThread.tenantId, t.id),
				eq(message.authorType, 'tenant'),
				gt(message.createdAt, new Date(Date.now() - 3600_000))
			)
		);
	if ((recent?.n ?? 0) >= TENANT_MESSAGES_PER_HOUR)
		error(429, 'You have sent a lot of messages. Please wait a bit before sending more.');
	const name = tenantName(t);
	const m = await postMessage(
		t.organizationId,
		t.id,
		{ type: 'tenant', id: userId, name },
		input.body
	);
	if (!isDemo()) await notifyStaffMessage(t.organizationId, m, { tenantId: t.id, name });
	return m;
}

/** Tenants on an active lease, at one property or across the workspace. */
async function audience(orgId: string, propertyId: string | null) {
	const rows = await db
		.selectDistinct({
			id: tenant.id,
			kind: tenant.kind,
			firstName: tenant.firstName,
			lastName: tenant.lastName,
			companyName: tenant.companyName,
			email: tenant.email
		})
		.from(leaseTenant)
		.innerJoin(lease, and(eq(lease.id, leaseTenant.leaseId), eq(lease.status, 'active')))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(tenant, eq(tenant.id, leaseTenant.tenantId))
		.where(
			and(eq(lease.organizationId, orgId), propertyId ? eq(unit.propertyId, propertyId) : undefined)
		);
	return rows.map((r) => ({ name: tenantName(r), email: r.email }));
}

async function assertProperty(orgId: string, propertyId: string | null | undefined) {
	if (!propertyId) return;
	const p = await db.query.property.findFirst({
		where: (p, { and, eq }) => and(eq(p.organizationId, orgId), eq(p.id, propertyId))
	});
	if (!p) error(404, 'Property not found');
}

export async function announcementAudience(orgId: string, propertyId: string | null) {
	await assertProperty(orgId, propertyId);
	const rs = await audience(orgId, propertyId);
	return { residents: rs.length, withEmail: rs.filter((r) => r.email).length };
}

export async function listAnnouncements(orgId: string) {
	return db
		.select({
			id: announcement.id,
			subject: announcement.subject,
			body: announcement.body,
			emailed: announcement.emailed,
			recipientCount: announcement.recipientCount,
			createdAt: announcement.createdAt,
			propertyId: announcement.propertyId,
			propertyName: property.name,
			sentByName: user.name
		})
		.from(announcement)
		.leftJoin(property, eq(property.id, announcement.propertyId))
		.leftJoin(user, eq(user.id, announcement.sentBy))
		.where(eq(announcement.organizationId, orgId))
		.orderBy(desc(announcement.createdAt))
		.limit(200);
}

export async function createAnnouncement(ctx: OrgContext, input: Out<typeof announcementCreate>) {
	const propertyId = input.propertyId ?? null;
	await assertProperty(ctx.orgId, propertyId);
	const residents = await audience(ctx.orgId, propertyId);
	const email = input.email && !isDemo();
	const [a] = await db
		.insert(announcement)
		.values({
			organizationId: ctx.orgId,
			propertyId,
			subject: input.subject,
			body: input.body,
			emailed: email,
			recipientCount: residents.length,
			sentBy: ctx.userId
		})
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'announcement',
		entityId: a!.id,
		action: 'sent',
		summary: `Announcement sent: ${a!.subject}`,
		data: { propertyId, recipients: residents.length, emailed: email }
	});
	const emailed = email ? await notifyAnnouncement(ctx.orgId, a!, residents) : 0;
	return { ...a!, emailedCount: emailed };
}

export async function deleteAnnouncement(ctx: OrgContext, id: string) {
	const [a] = await db
		.delete(announcement)
		.where(and(eq(announcement.organizationId, ctx.orgId), eq(announcement.id, id)))
		.returning({ id: announcement.id });
	if (!a) error(404, 'Announcement not found');
}

/** Recent announcements for the properties and workspaces a resident currently leases in. */
export async function portalAnnouncements(tenantIds: string[]) {
	if (!tenantIds.length) return [];
	const homesRows = await db
		.selectDistinct({ orgId: lease.organizationId, propertyId: unit.propertyId })
		.from(leaseTenant)
		.innerJoin(
			lease,
			and(eq(lease.id, leaseTenant.leaseId), inArray(lease.status, ['active', 'draft']))
		)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.where(inArray(leaseTenant.tenantId, tenantIds));
	if (!homesRows.length) return [];
	const since = new Date(Date.now() - PORTAL_ANNOUNCEMENT_DAYS * 86400_000);
	return db
		.select({
			id: announcement.id,
			subject: announcement.subject,
			body: announcement.body,
			createdAt: announcement.createdAt,
			propertyName: property.name
		})
		.from(announcement)
		.leftJoin(property, eq(property.id, announcement.propertyId))
		.where(
			and(
				gt(announcement.createdAt, since),
				or(
					and(
						isNull(announcement.propertyId),
						inArray(
							announcement.organizationId,
							homesRows.map((h) => h.orgId)
						)
					),
					inArray(
						announcement.propertyId,
						homesRows.map((h) => h.propertyId)
					)
				)
			)
		)
		.orderBy(desc(announcement.createdAt))
		.limit(20);
}

/** Threads for arbitrary tenant ids, read-only (no read-marking) — for the manager portal preview. */
export async function tenantMessageThreads(tenantIds: string[]) {
	if (!tenantIds.length) return [];
	const rows = await db
		.select({ thread: messageThread, orgName: organization.name })
		.from(messageThread)
		.innerJoin(tenant, eq(tenant.id, messageThread.tenantId))
		.innerJoin(organization, eq(organization.id, tenant.organizationId))
		.where(inArray(messageThread.tenantId, tenantIds));
	const out = [];
	for (const { thread, orgName } of rows) {
		out.push({
			tenantId: thread.tenantId,
			orgName,
			lastReadAt: thread.tenantReadAt ?? null,
			messages: await threadMessages(thread.id)
		});
	}
	return out;
}
