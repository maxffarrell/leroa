import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	lease,
	maintenanceTicket,
	organization,
	owner,
	payment,
	property,
	propertyOwner,
	unit
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { ownerInput, ownerUpdate } from '#lib/schemas.ts';
import { addDays, monthKey, todayISO } from '#lib/format.ts';
import { outer, rentRoll, tenantNames } from './leasing.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

export async function listOwners(orgId: string, opts: { includeArchived?: boolean } = {}) {
	return db
		.select({
			id: owner.id,
			name: owner.name,
			email: owner.email,
			phone: owner.phone,
			portalLinked: sql<boolean>`${owner.portalUserId} is not null`,
			archivedAt: owner.archivedAt,
			properties: sql<
				string[]
			>`coalesce(array_agg(${property.name} order by ${property.name}) filter (where ${property.id} is not null), '{}')`,
			unitCount:
				sql<number>`(select count(*) from ${unit} join ${propertyOwner} po on po.property_id = ${unit.propertyId} where po.owner_id = ${owner.id})`.mapWith(
					Number
				)
		})
		.from(owner)
		.leftJoin(propertyOwner, eq(propertyOwner.ownerId, owner.id))
		.leftJoin(property, and(eq(property.id, propertyOwner.propertyId), isNull(property.archivedAt)))
		.where(
			and(
				eq(owner.organizationId, orgId),
				opts.includeArchived ? undefined : isNull(owner.archivedAt)
			)
		)
		.groupBy(owner.id)
		.orderBy(asc(owner.name));
}

async function ownerProperties(orgId: string, ownerId: string) {
	return db
		.select({
			id: property.id,
			name: property.name,
			address: sql<string>`concat_ws(', ', nullif(${property.addressLine1}, ''), nullif(${property.city}, ''), nullif(${property.region}, ''))`
		})
		.from(propertyOwner)
		.innerJoin(property, eq(property.id, propertyOwner.propertyId))
		.where(
			and(
				eq(propertyOwner.ownerId, ownerId),
				eq(property.organizationId, orgId),
				isNull(property.archivedAt)
			)
		)
		.orderBy(asc(property.name));
}

export async function getOwner(orgId: string, id: string) {
	const row = await db.query.owner.findFirst({
		where: (o, { and, eq }) => and(eq(o.organizationId, orgId), eq(o.id, id))
	});
	if (!row) error(404, 'Owner not found');
	const { portalUserId, ...rest } = row;
	return { ...rest, portalLinked: !!portalUserId, properties: await ownerProperties(orgId, id) };
}

/** Owners of one property, for the property page. */
export async function propertyOwners(orgId: string, propertyId: string) {
	return db
		.select({ id: owner.id, name: owner.name })
		.from(propertyOwner)
		.innerJoin(owner, eq(owner.id, propertyOwner.ownerId))
		.where(
			and(
				eq(propertyOwner.propertyId, propertyId),
				eq(owner.organizationId, orgId),
				isNull(owner.archivedAt)
			)
		)
		.orderBy(asc(owner.name));
}

async function setProperties(orgId: string, ownerId: string, propertyIds: string[]) {
	const ids = [...new Set(propertyIds)];
	if (ids.length) {
		const found = await db
			.select({ id: property.id })
			.from(property)
			.where(and(eq(property.organizationId, orgId), inArray(property.id, ids)));
		if (found.length !== ids.length) error(404, 'Property not found');
	}
	await db.transaction(async (tx) => {
		await tx.delete(propertyOwner).where(eq(propertyOwner.ownerId, ownerId));
		if (ids.length)
			await tx.insert(propertyOwner).values(ids.map((propertyId) => ({ propertyId, ownerId })));
	});
}

const clean = <T extends { email?: string | null }>(data: T) => ({
	...data,
	...(data.email !== undefined ? { email: data.email || null } : {})
});

export async function createOwner(ctx: OrgContext, input: Out<typeof ownerInput>) {
	const { propertyIds = [], ...data } = input;
	if (ctx.propertyIds && !propertyIds.length) error(403, 'Select an assigned property');
	const [row] = await db
		.insert(owner)
		.values({ ...clean(data), organizationId: ctx.orgId })
		.returning();
	await setProperties(ctx.orgId, row!.id, propertyIds);
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'owner',
		entityId: row!.id,
		action: 'created',
		summary: `Added owner ${row!.name}`
	});
	return row!;
}

export async function updateOwner(
	ctx: OrgContext,
	{ id, archived, propertyIds, ...data }: Out<typeof ownerUpdate>
) {
	if (ctx.propertyIds && propertyIds?.length === 0) error(403, 'Select an assigned property');
	const [row] = await db
		.update(owner)
		.set({
			...clean(data),
			...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null })
		})
		.where(and(eq(owner.organizationId, ctx.orgId), eq(owner.id, id)))
		.returning();
	if (!row) error(404, 'Owner not found');
	if (propertyIds) await setProperties(ctx.orgId, id, propertyIds);
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'owner',
		entityId: id,
		action: 'updated',
		summary:
			archived === undefined
				? `Updated owner ${row.name}`
				: `${archived ? 'Archived' : 'Restored'} owner ${row.name}`
	});
	return row;
}

const TTL_MS = 14 * 86400_000;
const sign = (payload: string) =>
	createHmac('sha256', BETTER_AUTH_SECRET).update(`owner:${payload}`).digest('base64url');

/** A signed, expiring link that attaches the signed-in user to an owner record. */
export function ownerToken(ownerId: string) {
	const payload = `${ownerId}.${Date.now() + TTL_MS}`;
	return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export async function claimOwner(token: string, userId: string) {
	const [encoded, sig] = token.split('.');
	if (!encoded || !sig) error(400, 'Invalid link');
	const payload = Buffer.from(encoded, 'base64url').toString();
	const expected = Buffer.from(sign(payload));
	const given = Buffer.from(sig);
	if (expected.length !== given.length || !timingSafeEqual(expected, given))
		error(400, 'Invalid link');
	const [ownerId, exp] = payload.split('.');
	if (!ownerId || Number(exp) < Date.now())
		error(410, 'This link has expired. Ask your property manager for a new one.');
	const [row] = await db
		.update(owner)
		.set({ portalUserId: userId })
		.where(and(eq(owner.id, ownerId), isNull(owner.archivedAt)))
		.returning();
	if (!row) error(404, 'Owner not found');
	return row;
}

export async function ownerAccounts(userId: string) {
	return db
		.select({
			id: owner.id,
			name: owner.name,
			orgId: owner.organizationId,
			orgName: organization.name
		})
		.from(owner)
		.innerJoin(organization, eq(organization.id, owner.organizationId))
		.where(and(eq(owner.portalUserId, userId), isNull(owner.archivedAt)))
		.orderBy(asc(organization.name));
}

const OPEN_STATUSES = ['open', 'in_progress', 'on_hold'] as const;

/** Everything an owner sees: occupancy, this month's rent, a 6-month collection trend, expiring leases and maintenance. No tenant contact details. */
export async function ownerReport(orgId: string, ownerId: string) {
	const props = await ownerProperties(orgId, ownerId);
	const ids = props.map((p) => p.id);
	const month = monthKey();
	const today = todayISO();
	const empty = {
		month,
		currency: 'USD',
		properties: [] as never[],
		totals: {
			units: 0,
			occupied: 0,
			vacant: 0,
			notice: 0,
			scheduledRent: 0,
			rentDue: 0,
			rentCollected: 0,
			overdue: 0
		},
		trend: [] as { month: string; due: number; collected: number }[],
		expiring: [] as never[],
		maintenance: { open: [] as never[], recent: [] as never[], spendYtd: 0 }
	};
	if (!ids.length) return empty;

	const trendStart = (() => {
		const [y, m] = month.split('-').map(Number) as [number, number];
		return new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 10);
	})();
	const monthEnd = (() => {
		const [y, m] = month.split('-').map(Number) as [number, number];
		return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
	})();
	const yearStart = `${today.slice(0, 4)}-01-01`;
	const in90 = addDays(today, 90);

	const [roll, units, trend, tickets] = await Promise.all([
		rentRoll(orgId, month),
		db
			.select({
				id: unit.id,
				name: unit.name,
				status: unit.status,
				propertyId: unit.propertyId,
				leaseId: lease.id,
				leaseRent: lease.rentAmount,
				leaseEnd: lease.endDate,
				currency: lease.currency,
				tenants: tenantNames,
				renewing: sql<boolean>`exists (select 1 from ${lease} r where r.renewed_from_id = ${lease.id} and r.status in ('active', 'draft'))`
			})
			.from(unit)
			.leftJoin(
				lease,
				and(
					eq(lease.unitId, unit.id),
					eq(lease.status, 'active'),
					sql`not (${lease.renewedFromId} is not null and ${lease.startDate} > current_date)`,
					sql`not exists (select 1 from ${lease} r where r.renewed_from_id = ${lease.id} and r.status = 'active' and r.start_date <= current_date)`
				)
			)
			.where(and(eq(unit.organizationId, orgId), inArray(unit.propertyId, ids)))
			.orderBy(sql`length(${unit.name})`, asc(unit.name)),
		db
			.select({
				month: sql<string>`to_char(${charge.dueDate}, 'YYYY-MM')`,
				due: sql<number>`sum(${charge.amount})`.mapWith(Number),
				collected:
					sql<number>`sum(least(${charge.amount}, coalesce((select sum(${payment.amount}) from ${payment} where ${payment.chargeId} = ${outer(charge.id)}), 0)))`.mapWith(
						Number
					)
			})
			.from(charge)
			.innerJoin(lease, eq(lease.id, charge.leaseId))
			.innerJoin(unit, eq(unit.id, lease.unitId))
			.where(
				and(
					eq(charge.organizationId, orgId),
					eq(charge.kind, 'rent'),
					inArray(unit.propertyId, ids),
					gte(charge.dueDate, trendStart),
					lte(charge.dueDate, monthEnd)
				)
			)
			.groupBy(sql`1`)
			.orderBy(sql`1`),
		db
			.select({
				id: maintenanceTicket.id,
				number: maintenanceTicket.number,
				title: maintenanceTicket.title,
				status: maintenanceTicket.status,
				priority: maintenanceTicket.priority,
				costAmount: maintenanceTicket.costAmount,
				createdAt: maintenanceTicket.createdAt,
				closedAt: maintenanceTicket.closedAt,
				propertyName: property.name,
				unitName: unit.name
			})
			.from(maintenanceTicket)
			.innerJoin(property, eq(property.id, maintenanceTicket.propertyId))
			.leftJoin(unit, eq(unit.id, maintenanceTicket.unitId))
			.where(
				and(
					eq(maintenanceTicket.organizationId, orgId),
					inArray(maintenanceTicket.propertyId, ids),
					sql`(${maintenanceTicket.status} in ('open', 'in_progress', 'on_hold') or ${maintenanceTicket.closedAt} >= ${yearStart}::date)`
				)
			)
			.orderBy(desc(maintenanceTicket.createdAt))
	]);

	const rent = roll.filter((r) => r.kind === 'rent' && ids.includes(r.propertyId));
	const rentStatus = new Map(rent.map((r) => [r.leaseId, r.status]));
	const currency = units.find((u) => u.currency)?.currency ?? 'USD';

	const properties = props.map((p) => {
		const list = units
			.filter((u) => u.propertyId === p.id)
			.map((u) => ({
				id: u.id,
				name: u.name,
				status: u.status,
				tenants: u.leaseId ? u.tenants : null,
				leaseRent: u.leaseRent,
				leaseEnd: u.leaseEnd,
				rentStatus: u.leaseId ? (rentStatus.get(u.leaseId) ?? null) : null
			}));
		return {
			...p,
			units: list,
			occupied: list.filter((u) => u.status === 'occupied').length,
			scheduledRent: list.reduce((s, u) => s + (u.leaseRent ?? 0), 0)
		};
	});

	const count = (s: string) => units.filter((u) => u.status === s).length;
	const done = tickets.filter((t) => !(OPEN_STATUSES as readonly string[]).includes(t.status));

	return {
		month,
		currency,
		properties,
		totals: {
			units: units.length,
			occupied: count('occupied'),
			vacant: count('vacant'),
			notice: count('notice'),
			scheduledRent: properties.reduce((s, p) => s + p.scheduledRent, 0),
			rentDue: rent.reduce((s, r) => s + r.amount, 0),
			rentCollected: rent.reduce((s, r) => s + Math.min(r.paid, r.amount), 0),
			overdue: rent.filter(
				(r) => r.status === 'overdue' || (r.status === 'partial' && r.dueDate < today)
			).length
		},
		trend,
		expiring: units
			.filter((u) => u.leaseId && u.leaseEnd && u.leaseEnd >= today && u.leaseEnd <= in90)
			.sort((a, b) => a.leaseEnd!.localeCompare(b.leaseEnd!))
			.map((u) => ({
				unitId: u.id,
				unitName: u.name,
				propertyName: props.find((p) => p.id === u.propertyId)!.name,
				endDate: u.leaseEnd!,
				tenants: u.tenants,
				renewing: u.renewing
			})),
		maintenance: {
			open: tickets.filter((t) => (OPEN_STATUSES as readonly string[]).includes(t.status)),
			recent: done.filter((t) => t.status === 'done').slice(0, 10),
			spendYtd: done.filter((t) => t.status === 'done').reduce((s, t) => s + (t.costAmount ?? 0), 0)
		}
	};
}

export type OwnerReport = Awaited<ReturnType<typeof ownerReport>>;

export async function ownerPortal(userId: string) {
	const accounts = await ownerAccounts(userId);
	return Promise.all(
		accounts.map(async (a) => ({ ...a, report: await ownerReport(a.orgId, a.id) }))
	);
}
