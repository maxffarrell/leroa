import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	lease,
	leaseClause,
	leaseCriticalDate,
	leaseTiItem,
	property,
	unit
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { clauseInput, criticalDateInput, tiItemInput, tiItemUpdate } from '#lib/schemas.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

async function checkLease(ctx: OrgContext, leaseId: string) {
	const [l] = await db
		.select({ id: lease.id })
		.from(lease)
		.where(and(eq(lease.id, leaseId), eq(lease.organizationId, ctx.orgId)));
	if (!l) error(404, 'Lease not found');
	return l;
}

export async function listClauses(orgId: string, leaseId: string) {
	return db
		.select()
		.from(leaseClause)
		.where(and(eq(leaseClause.organizationId, orgId), eq(leaseClause.leaseId, leaseId)))
		.orderBy(asc(leaseClause.createdAt));
}

export async function addClause(ctx: OrgContext, input: Out<typeof clauseInput>) {
	await checkLease(ctx, input.leaseId);
	const [row] = await db
		.insert(leaseClause)
		.values({
			organizationId: ctx.orgId,
			leaseId: input.leaseId,
			kind: input.kind,
			title: input.title,
			body: input.body || null
		})
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: input.leaseId,
		action: 'clause_added',
		summary: `Clause added: ${row.title}`
	});
	return row;
}

export async function deleteClause(ctx: OrgContext, id: string) {
	const [row] = await db
		.delete(leaseClause)
		.where(and(eq(leaseClause.id, id), eq(leaseClause.organizationId, ctx.orgId)))
		.returning();
	if (!row) error(404, 'Clause not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: row.leaseId,
		action: 'clause_removed',
		summary: `Clause removed: ${row.title}`
	});
	return row;
}

export async function listCriticalDates(orgId: string, leaseId: string) {
	return db
		.select({
			id: leaseCriticalDate.id,
			label: leaseCriticalDate.label,
			date: leaseCriticalDate.date,
			remindDays: leaseCriticalDate.remindDays,
			doneAt: leaseCriticalDate.doneAt,
			clauseId: leaseCriticalDate.clauseId,
			clauseTitle: leaseClause.title
		})
		.from(leaseCriticalDate)
		.leftJoin(leaseClause, eq(leaseClause.id, leaseCriticalDate.clauseId))
		.where(and(eq(leaseCriticalDate.organizationId, orgId), eq(leaseCriticalDate.leaseId, leaseId)))
		.orderBy(asc(leaseCriticalDate.date));
}

export async function addCriticalDate(ctx: OrgContext, input: Out<typeof criticalDateInput>) {
	await checkLease(ctx, input.leaseId);
	if (input.clauseId) {
		const [c] = await db
			.select({ id: leaseClause.id })
			.from(leaseClause)
			.where(and(eq(leaseClause.id, input.clauseId), eq(leaseClause.leaseId, input.leaseId)));
		if (!c) error(400, 'Clause not on this lease');
	}
	const [row] = await db
		.insert(leaseCriticalDate)
		.values({
			organizationId: ctx.orgId,
			leaseId: input.leaseId,
			clauseId: input.clauseId || null,
			label: input.label,
			date: input.date,
			remindDays: input.remindDays ?? 30
		})
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: input.leaseId,
		action: 'critical_date_added',
		summary: `Critical date added: ${input.label} (${input.date})`
	});
	return row;
}

export async function setCriticalDateDone(ctx: OrgContext, id: string, done: boolean) {
	const [row] = await db
		.update(leaseCriticalDate)
		.set({ doneAt: done ? new Date() : null })
		.where(and(eq(leaseCriticalDate.id, id), eq(leaseCriticalDate.organizationId, ctx.orgId)))
		.returning();
	if (!row) error(404, 'Date not found');
	return row;
}

export async function deleteCriticalDate(ctx: OrgContext, id: string) {
	const [row] = await db
		.delete(leaseCriticalDate)
		.where(and(eq(leaseCriticalDate.id, id), eq(leaseCriticalDate.organizationId, ctx.orgId)))
		.returning();
	if (!row) error(404, 'Date not found');
	return row;
}

/** Open critical dates across the org, soonest first — feeds the leases-page strip. */
export async function upcomingCriticalDates(orgId: string) {
	return db
		.select({
			id: leaseCriticalDate.id,
			label: leaseCriticalDate.label,
			date: leaseCriticalDate.date,
			leaseId: leaseCriticalDate.leaseId,
			unitName: unit.name,
			propertyName: property.name
		})
		.from(leaseCriticalDate)
		.innerJoin(lease, eq(lease.id, leaseCriticalDate.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(leaseCriticalDate.organizationId, orgId), isNull(leaseCriticalDate.doneAt)))
		.orderBy(asc(leaseCriticalDate.date))
		.limit(8);
}

export const criticalDateDueSql = sql<boolean>`${leaseCriticalDate.date} <= current_date + ${leaseCriticalDate.remindDays}`;

export async function listTiItems(orgId: string, leaseId: string) {
	return db
		.select()
		.from(leaseTiItem)
		.where(and(eq(leaseTiItem.organizationId, orgId), eq(leaseTiItem.leaseId, leaseId)))
		.orderBy(asc(leaseTiItem.createdAt));
}

export async function addTiItem(ctx: OrgContext, input: Out<typeof tiItemInput>) {
	await checkLease(ctx, input.leaseId);
	const [row] = await db
		.insert(leaseTiItem)
		.values({
			organizationId: ctx.orgId,
			leaseId: input.leaseId,
			name: input.name,
			budgetAmount: input.budgetAmount ?? 0,
			actualAmount: input.actualAmount ?? 0,
			dueDate: input.dueDate || null,
			notes: input.notes || null
		})
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: input.leaseId,
		action: 'ti_added',
		summary: `TI item added: ${row.name}`
	});
	return row;
}

export async function updateTiItem(ctx: OrgContext, input: Out<typeof tiItemUpdate>) {
	const patch: Partial<typeof leaseTiItem.$inferInsert> = {};
	if (input.status !== undefined) patch.status = input.status;
	if (input.actualAmount !== undefined) patch.actualAmount = input.actualAmount ?? 0;
	if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
	if (input.notes !== undefined) patch.notes = input.notes;
	const [row] = await db
		.update(leaseTiItem)
		.set(patch)
		.where(and(eq(leaseTiItem.id, input.id), eq(leaseTiItem.organizationId, ctx.orgId)))
		.returning();
	if (!row) error(404, 'Item not found');
	return row;
}

export async function deleteTiItem(ctx: OrgContext, id: string) {
	const [row] = await db
		.delete(leaseTiItem)
		.where(and(eq(leaseTiItem.id, id), eq(leaseTiItem.organizationId, ctx.orgId)))
		.returning();
	if (!row) error(404, 'Item not found');
	return row;
}
