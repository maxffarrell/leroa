import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { inboxItem, member } from '#lib/server/db/schema.ts';

export type InboxNotice = { title: string; body?: string; href?: string };

/**
 * Creates one inbox item per owner/admin in the org, deduped per
 * (kind, entity, user) — retries of the same event do not pile up.
 */
export async function inboxForManagers(
	orgId: string,
	kind: string,
	entityId: string,
	notice: InboxNotice
) {
	const rows = await db
		.select({ userId: member.userId })
		.from(member)
		.where(and(eq(member.organizationId, orgId), inArray(member.role, ['owner', 'admin'])));
	if (!rows.length) return 0;
	await db
		.insert(inboxItem)
		.values(
			rows.map((r) => ({
				organizationId: orgId,
				userId: r.userId,
				kind,
				entityId,
				title: notice.title,
				body: notice.body ?? null,
				href: notice.href ?? null
			}))
		)
		.onConflictDoNothing();
	return rows.length;
}

export async function listInbox(orgId: string, userId: string, limit = 30) {
	const items = await db
		.select({
			id: inboxItem.id,
			kind: inboxItem.kind,
			title: inboxItem.title,
			body: inboxItem.body,
			href: inboxItem.href,
			readAt: inboxItem.readAt,
			createdAt: inboxItem.createdAt
		})
		.from(inboxItem)
		.where(and(eq(inboxItem.organizationId, orgId), eq(inboxItem.userId, userId)))
		.orderBy(desc(inboxItem.createdAt))
		.limit(limit);
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(inboxItem)
		.where(
			and(
				eq(inboxItem.organizationId, orgId),
				eq(inboxItem.userId, userId),
				isNull(inboxItem.readAt)
			)
		);
	return { items, unread: count };
}

export async function markInboxRead(orgId: string, userId: string, ids: string[]) {
	if (!ids.length) return;
	await db
		.update(inboxItem)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(inboxItem.organizationId, orgId),
				eq(inboxItem.userId, userId),
				inArray(inboxItem.id, ids),
				isNull(inboxItem.readAt)
			)
		);
}

export async function markAllInboxRead(orgId: string, userId: string) {
	await db
		.update(inboxItem)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(inboxItem.organizationId, orgId),
				eq(inboxItem.userId, userId),
				isNull(inboxItem.readAt)
			)
		);
}
