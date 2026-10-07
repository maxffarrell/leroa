import { and, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { activity, member, user } from '#lib/server/db/schema.ts';

export type AuditFilter = {
	entityType?: string;
	action?: string;
	actorId?: string;
	q?: string;
	from?: string; // YYYY-MM-DD
	to?: string; // YYYY-MM-DD
	before?: string; // createdAt cursor (ISO) for pagination
	limit?: number;
};

function conditions(orgId: string, f: AuditFilter): SQL[] {
	const conds: SQL[] = [eq(activity.organizationId, orgId)];
	if (f.entityType) conds.push(eq(activity.entityType, f.entityType));
	if (f.action) conds.push(eq(activity.action, f.action));
	if (f.actorId) conds.push(eq(activity.actorId, f.actorId));
	if (f.from) conds.push(gte(activity.createdAt, new Date(`${f.from}T00:00:00Z`)));
	if (f.to) conds.push(lte(activity.createdAt, new Date(`${f.to}T23:59:59.999Z`)));
	if (f.before) conds.push(lt(activity.createdAt, new Date(f.before)));
	const q = f.q?.trim();
	if (q)
		conds.push(
			or(
				ilike(activity.summary, `%${q}%`),
				ilike(activity.entityId, `%${q}%`),
				ilike(user.name, `%${q}%`)
			)!
		);
	return conds;
}

const select = {
	id: activity.id,
	action: activity.action,
	entityType: activity.entityType,
	entityId: activity.entityId,
	summary: activity.summary,
	createdAt: activity.createdAt,
	actorId: activity.actorId,
	actorName: user.name
};

/** Paged audit rows, newest first. `before` is the last row's createdAt. */
export async function listAudit(orgId: string, f: AuditFilter) {
	const limit = Math.min(f.limit ?? 50, 200);
	const rows = await db
		.select(select)
		.from(activity)
		.leftJoin(user, eq(user.id, activity.actorId))
		.where(and(...conditions(orgId, f)))
		.orderBy(desc(activity.createdAt), desc(activity.id))
		.limit(limit + 1);
	const hasMore = rows.length > limit;
	return { rows: rows.slice(0, limit), hasMore };
}

export async function exportAudit(orgId: string, f: AuditFilter) {
	return db
		.select(select)
		.from(activity)
		.leftJoin(user, eq(user.id, activity.actorId))
		.where(and(...conditions(orgId, f)))
		.orderBy(desc(activity.createdAt), desc(activity.id))
		.limit(10_000);
}

/** Distinct entity types and workspace members, for the filter dropdowns. */
export async function auditFacets(orgId: string) {
	const [types, actors] = await Promise.all([
		db
			.selectDistinct({ entityType: activity.entityType })
			.from(activity)
			.where(eq(activity.organizationId, orgId))
			.orderBy(activity.entityType),
		db
			.select({ id: user.id, name: user.name })
			.from(member)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(member.organizationId, orgId))
			.orderBy(user.name)
	]);
	const actions = await db
		.selectDistinct({ action: activity.action })
		.from(activity)
		.where(eq(activity.organizationId, orgId))
		.orderBy(activity.action);
	return {
		entityTypes: types.map((t) => t.entityType),
		actions: actions.map((a) => a.action),
		actors
	};
}

export async function auditCount(orgId: string) {
	const [{ count }] = await db
		.select({ count: sql<number>`count(*)`.mapWith(Number) })
		.from(activity)
		.where(eq(activity.organizationId, orgId));
	return count;
}
