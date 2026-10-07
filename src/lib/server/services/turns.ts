import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	lease,
	listing,
	maintenanceTicket,
	property,
	unit,
	unitTurn
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { turnInput, turnUpdate } from '#lib/schemas.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const OPEN_TICKET = sql`${maintenanceTicket.status} in ('open', 'in_progress', 'on_hold')`;

/** Turns with their unit, property, open-work-order count and published-listing flag. */
export async function listTurns(orgId: string, opts: { includeDone?: boolean } = {}) {
	const rows = await db
		.select({
			id: unitTurn.id,
			unitId: unitTurn.unitId,
			leaseId: unitTurn.leaseId,
			stage: unitTurn.stage,
			moveOutOn: unitTurn.moveOutOn,
			targetReadyOn: unitTurn.targetReadyOn,
			notes: unitTurn.notes,
			completedAt: unitTurn.completedAt,
			createdAt: unitTurn.createdAt,
			updatedAt: unitTurn.updatedAt,
			unitName: unit.name,
			unitStatus: unit.status,
			propertyId: property.id,
			propertyName: property.name,
			listed:
				sql<boolean>`exists (select 1 from ${listing} l where l.unit_id = ${unitTurn.unitId} and l.organization_id = ${unitTurn.organizationId} and l.status = 'published')`.mapWith(
					Boolean
				)
		})
		.from(unitTurn)
		.innerJoin(unit, eq(unit.id, unitTurn.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(
				eq(unitTurn.organizationId, orgId),
				opts.includeDone ? undefined : isNull(unitTurn.completedAt)
			)
		)
		.orderBy(asc(unitTurn.createdAt));

	const unitIds = [...new Set(rows.map((r) => r.unitId))];
	const openCounts = unitIds.length
		? await db
				.select({
					unitId: maintenanceTicket.unitId,
					n: sql<number>`count(*)`.mapWith(Number)
				})
				.from(maintenanceTicket)
				.where(
					and(
						eq(maintenanceTicket.organizationId, orgId),
						inArray(maintenanceTicket.unitId, unitIds),
						OPEN_TICKET
					)
				)
				.groupBy(maintenanceTicket.unitId)
		: [];
	const byUnit = new Map(openCounts.map((r) => [r.unitId, r.n]));
	return rows.map((r) => ({ ...r, openTickets: byUnit.get(r.unitId) ?? 0 }));
}

export type Turn = Awaited<ReturnType<typeof listTurns>>[number];

async function turnInOrg(orgId: string, id: string) {
	const [row] = await db
		.select()
		.from(unitTurn)
		.where(and(eq(unitTurn.organizationId, orgId), eq(unitTurn.id, id)));
	if (!row) error(404, 'Unit turn not found');
	return row;
}

async function unitInOrg(orgId: string, id: string) {
	const [row] = await db
		.select({ id: unit.id, name: unit.name })
		.from(unit)
		.where(and(eq(unit.organizationId, orgId), eq(unit.id, id)));
	if (!row) error(404, 'Unit not found');
	return row;
}

/** The unit's open turn, if one is running. */
async function openTurnForUnit(orgId: string, unitId: string) {
	const [row] = await db
		.select()
		.from(unitTurn)
		.where(
			and(
				eq(unitTurn.organizationId, orgId),
				eq(unitTurn.unitId, unitId),
				isNull(unitTurn.completedAt)
			)
		);
	return row ?? null;
}

/** Starts tracking a turn for a vacant or notice-status unit. */
export async function startTurn(ctx: OrgContext, input: Out<typeof turnInput>) {
	const u = await unitInOrg(ctx.orgId, input.unitId);
	if (await openTurnForUnit(ctx.orgId, u.id)) error(409, `${u.name} already has a turn running`);
	const [row] = await db
		.insert(unitTurn)
		.values({ ...input, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'turn',
		entityId: row!.id,
		action: 'created',
		summary: `Started a turn for ${u.name}`
	});
	return row!;
}

const STAGE_ORDER = ['move_out', 'make_ready', 'listed', 'done'] as const;

export async function updateTurn(ctx: OrgContext, { id, stage, ...data }: Out<typeof turnUpdate>) {
	const before = await turnInOrg(ctx.orgId, id);
	const done = (stage ?? before.stage) === 'done';
	const [row] = await db
		.update(unitTurn)
		.set({
			...data,
			...(stage ? { stage } : {}),
			completedAt: done ? (before.completedAt ?? new Date()) : null
		})
		.where(and(eq(unitTurn.organizationId, ctx.orgId), eq(unitTurn.id, id)))
		.returning();
	if (!row) error(404, 'Unit turn not found');
	if (stage && stage !== before.stage) {
		await emit({
			orgId: ctx.orgId,
			actorId: ctx.userId,
			entityType: 'turn',
			entityId: id,
			action: 'updated',
			summary: `Turn for unit moved to ${stage.replace('_', ' ')}`
		});
	}
	return row;
}

/**
 * Lease just ended or was terminated: open a move-out turn unless the unit
 * already has one or a renewal/line-up lease exists. Called from leasing.
 */
export async function autoStartTurn(
	ctx: { orgId: string; userId: string | null },
	l: { id: string; unitId: string; endDate: string | null }
) {
	const pending = await db
		.select({ id: lease.id })
		.from(lease)
		.where(
			and(
				eq(lease.organizationId, ctx.orgId),
				eq(lease.unitId, l.unitId),
				inArray(lease.status, ['draft', 'active'])
			)
		)
		.limit(1);
	if (pending.length) return null;
	if (await openTurnForUnit(ctx.orgId, l.unitId)) return null;
	const [row] = await db
		.insert(unitTurn)
		.values({
			organizationId: ctx.orgId,
			unitId: l.unitId,
			leaseId: l.id,
			moveOutOn: l.endDate
		})
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'turn',
		entityId: row!.id,
		action: 'created',
		summary: 'A lease ended — turn started'
	});
	return row;
}

/** A lease went active on a unit with an open turn → mark the turn done. */
export async function completeTurnsForUnit(
	ctx: { orgId: string; userId: string | null },
	unitId: string
) {
	const open = await openTurnForUnit(ctx.orgId, unitId);
	if (!open) return;
	await db
		.update(unitTurn)
		.set({ stage: 'done', completedAt: new Date() })
		.where(eq(unitTurn.id, open.id));
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'turn',
		entityId: open.id,
		action: 'updated',
		summary: 'Turn finished — unit re-leased'
	});
}

/** A listing for this unit was published → open turns advance to `listed`. */
export async function markTurnListed(
	ctx: { orgId: string; userId: string | null },
	unitId: string
) {
	const open = await openTurnForUnit(ctx.orgId, unitId);
	if (!open || STAGE_ORDER.indexOf(open.stage) >= STAGE_ORDER.indexOf('listed')) return;
	await db.update(unitTurn).set({ stage: 'listed' }).where(eq(unitTurn.id, open.id));
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'turn',
		entityId: open.id,
		action: 'updated',
		summary: 'Turn marked listed'
	});
}
