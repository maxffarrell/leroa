import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import { maintenanceTicket, property, tenant, unit, user } from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { ticketInput, ticketUpdate } from '#lib/schemas.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

export async function listTickets(orgId: string, opts: { propertyId?: string } = {}) {
	return db
		.select({
			id: maintenanceTicket.id,
			number: maintenanceTicket.number,
			title: maintenanceTicket.title,
			description: maintenanceTicket.description,
			status: maintenanceTicket.status,
			priority: maintenanceTicket.priority,
			dueDate: maintenanceTicket.dueDate,
			vendor: maintenanceTicket.vendor,
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
			assigneeName: user.name
		})
		.from(maintenanceTicket)
		.innerJoin(property, eq(property.id, maintenanceTicket.propertyId))
		.leftJoin(unit, eq(unit.id, maintenanceTicket.unitId))
		.leftJoin(tenant, eq(tenant.id, maintenanceTicket.tenantId))
		.leftJoin(user, eq(user.id, maintenanceTicket.assigneeId))
		.where(
			and(
				eq(maintenanceTicket.organizationId, orgId),
				opts.propertyId ? eq(maintenanceTicket.propertyId, opts.propertyId) : undefined
			)
		)
		.orderBy(
			sql`case ${maintenanceTicket.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`,
			desc(maintenanceTicket.createdAt)
		);
}

export type Ticket = Awaited<ReturnType<typeof listTickets>>[number];

export async function createTicket(ctx: OrgContext, input: Out<typeof ticketInput>) {
	const p = await db.query.property.findFirst({
		where: (p, { and, eq }) => and(eq(p.organizationId, ctx.orgId), eq(p.id, input.propertyId))
	});
	if (!p) error(404, 'Property not found');
	const created = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.orgId}))`);
		const [{ n }] = (await tx
			.select({ n: max(maintenanceTicket.number) })
			.from(maintenanceTicket)
			.where(eq(maintenanceTicket.organizationId, ctx.orgId))) as [{ n: number | null }];
		const [t] = await tx
			.insert(maintenanceTicket)
			.values({ ...input, organizationId: ctx.orgId, number: (n ?? 0) + 1 })
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
	return created;
}

export async function updateTicket(ctx: OrgContext, { id, ...data }: Out<typeof ticketUpdate>) {
	const closing = data.status === 'done' || data.status === 'cancelled';
	const [t] = await db
		.update(maintenanceTicket)
		.set({ ...data, ...(data.status ? { closedAt: closing ? new Date() : null } : {}) })
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
