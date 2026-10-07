import { and, asc, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import { asset, pmSchedule, property, unit, user, vendor } from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { scheduleInput, scheduleUpdate } from '#lib/schemas.ts';
import { advanceNextRun, isDue } from '#lib/pm.ts';
import { todayISO } from '#lib/format.ts';
import { emit } from './events.ts';
import { assertAsset } from './assets.ts';
import { createTicket } from './maintenance.ts';
import { assertVendor } from './vendors.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

export async function listSchedules(orgId: string, opts: { propertyId?: string } = {}) {
	return db
		.select({
			id: pmSchedule.id,
			title: pmSchedule.title,
			description: pmSchedule.description,
			priority: pmSchedule.priority,
			every: pmSchedule.every,
			interval: pmSchedule.interval,
			nextRunOn: pmSchedule.nextRunOn,
			lastRunOn: pmSchedule.lastRunOn,
			leadDays: pmSchedule.leadDays,
			enabled: pmSchedule.enabled,
			propertyId: property.id,
			propertyName: property.name,
			unitId: unit.id,
			unitName: unit.name,
			assetId: asset.id,
			assetName: asset.name,
			vendorId: vendor.id,
			vendorName: vendor.name,
			assigneeId: user.id,
			assigneeName: user.name
		})
		.from(pmSchedule)
		.innerJoin(property, eq(property.id, pmSchedule.propertyId))
		.leftJoin(unit, eq(unit.id, pmSchedule.unitId))
		.leftJoin(asset, eq(asset.id, pmSchedule.assetId))
		.leftJoin(vendor, eq(vendor.id, pmSchedule.vendorId))
		.leftJoin(user, eq(user.id, pmSchedule.assigneeId))
		.where(
			and(
				eq(pmSchedule.organizationId, orgId),
				opts.propertyId ? eq(pmSchedule.propertyId, opts.propertyId) : undefined
			)
		)
		.orderBy(desc(pmSchedule.enabled), asc(pmSchedule.nextRunOn), asc(pmSchedule.title));
}

export type ScheduleRow = Awaited<ReturnType<typeof listSchedules>>[number];

async function scheduleInOrg(orgId: string, id: string) {
	const [row] = await db
		.select()
		.from(pmSchedule)
		.where(and(eq(pmSchedule.organizationId, orgId), eq(pmSchedule.id, id)));
	if (!row) error(404, 'Schedule not found');
	return row;
}

/**
 * Fills in property/unit/vendor consistency: picking an asset supplies the
 * property (and unit, if the asset is unit-scoped); a unit implies its property.
 */
async function resolveRefs(
	orgId: string,
	input: {
		propertyId: string;
		unitId?: string | null;
		assetId?: string | null;
		vendorId?: string | null;
		assigneeId?: string | null;
	}
) {
	const { assetId, vendorId, assigneeId } = input;
	let { propertyId, unitId } = input;
	if (assetId) {
		const a = await assertAsset(orgId, assetId);
		propertyId = a.propertyId;
		unitId = unitId ?? a.unitId;
	}
	if (unitId) {
		const [u] = await db
			.select({ propertyId: unit.propertyId })
			.from(unit)
			.where(and(eq(unit.organizationId, orgId), eq(unit.id, unitId)));
		if (!u) error(404, 'Unit not found');
		if (u.propertyId !== propertyId && !assetId) error(400, 'That unit is not in the property');
		propertyId = u.propertyId;
	}
	const [p] = await db
		.select({ id: property.id })
		.from(property)
		.where(and(eq(property.organizationId, orgId), eq(property.id, propertyId)));
	if (!p) error(404, 'Property not found');
	if (vendorId) await assertVendor(orgId, vendorId);
	if (assigneeId) {
		const [m] = await db.select({ id: user.id }).from(user).where(eq(user.id, assigneeId));
		if (!m) error(404, 'Assignee not found');
	}
	return { propertyId, unitId, assetId, vendorId, assigneeId };
}

export async function createSchedule(ctx: OrgContext, input: Out<typeof scheduleInput>) {
	const refs = await resolveRefs(ctx.orgId, input);
	const [row] = await db
		.insert(pmSchedule)
		.values({ ...input, ...refs, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'schedule',
		entityId: row!.id,
		action: 'created',
		summary: `New schedule “${row!.title}”`
	});
	return row!;
}

export async function updateSchedule(
	ctx: OrgContext,
	{ id, enabled, ...data }: Out<typeof scheduleUpdate>
) {
	const before = await scheduleInOrg(ctx.orgId, id);
	const refs =
		data.assetId || data.unitId || data.vendorId || data.assigneeId
			? await resolveRefs(ctx.orgId, {
					propertyId: before.propertyId,
					unitId: data.unitId === undefined ? before.unitId : data.unitId,
					assetId: data.assetId === undefined ? before.assetId : data.assetId,
					vendorId: data.vendorId === undefined ? before.vendorId : data.vendorId,
					assigneeId: data.assigneeId === undefined ? before.assigneeId : data.assigneeId
				})
			: {};
	const [row] = await db
		.update(pmSchedule)
		.set({ ...data, ...refs, ...(enabled === undefined ? {} : { enabled }) })
		.where(and(eq(pmSchedule.organizationId, ctx.orgId), eq(pmSchedule.id, id)))
		.returning();
	if (!row) error(404, 'Schedule not found');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'schedule',
		entityId: id,
		action: 'updated',
		summary:
			enabled === undefined
				? `Updated schedule “${row.title}”`
				: `${enabled ? 'Resumed' : 'Paused'} schedule “${row.title}”`
	});
	return row;
}

/**
 * Issues the work order for a schedule's next run and rolls the run forward.
 * Used by both the cron pass and "run now" — pass `today` to override the check.
 */
async function issueRun(
	orgId: string,
	s: typeof pmSchedule.$inferSelect,
	today: string,
	opts: { force?: boolean } = {}
) {
	if (!opts.force && !isDue(s.nextRunOn, s.leadDays, today)) return null;
	const next = advanceNextRun(s.nextRunOn, s.every, s.interval, s.leadDays, today);
	if (!next) return null;
	const t = await createTicket(
		{ orgId, userId: null },
		{
			propertyId: s.propertyId,
			unitId: s.unitId,
			tenantId: null,
			title: s.title,
			description: s.description,
			priority: s.priority,
			status: 'open',
			assigneeId: s.assigneeId,
			vendorId: s.vendorId,
			assetId: s.assetId,
			costAmount: null,
			dueDate: s.nextRunOn,
			scheduleId: s.id
		}
	);
	await db
		.update(pmSchedule)
		.set({ lastRunOn: s.nextRunOn, nextRunOn: next })
		.where(eq(pmSchedule.id, s.id));
	await emit({
		orgId,
		entityType: 'schedule',
		entityId: s.id,
		action: 'ran',
		summary: `Schedule “${s.title}” issued work order #${t.number}`,
		data: { ticketId: t.id }
	});
	return t;
}

/** Creates work orders for every enabled schedule whose lead window has opened. */
export async function runDueSchedules(orgId: string, today = todayISO()) {
	const schedules = await db
		.select()
		.from(pmSchedule)
		.where(and(eq(pmSchedule.organizationId, orgId), eq(pmSchedule.enabled, true)));
	let issued = 0;
	for (const s of schedules) {
		if (await issueRun(orgId, s, today)) issued++;
	}
	return issued;
}

/** Issues a work order for the schedule right now, whatever the calendar says. */
export async function runScheduleNow(ctx: OrgContext, id: string) {
	const s = await scheduleInOrg(ctx.orgId, id);
	if (!s.enabled) error(409, 'Resume the schedule first');
	const t = await issueRun(ctx.orgId, s, todayISO(), { force: true });
	if (!t) error(500, 'Could not issue the work order');
	return t;
}
