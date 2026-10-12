import { allows, type ApiResource } from '#lib/api-permissions.ts';
import { filterRecords } from '#lib/server/access.ts';
import type { OrgContext } from '#lib/server/context.ts';
import { listUnits } from './portfolio.ts';
import { listLeases } from './leasing.ts';
import { listTurns } from './turns.ts';
import { listVendors } from './vendors.ts';
import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { activity, lease, unit, unitTurn, user, vendor } from '#lib/server/db/schema.ts';
import { addDays, monthKey, todayISO } from '#lib/format.ts';
import { INSURANCE_WARNING_DAYS } from '#lib/vendors.ts';
import { rentRoll } from './leasing.ts';
import { listTickets } from './maintenance.ts';
import { leasingAttention } from './crm.ts';

export async function dashboard(orgId: string, ctx?: OrgContext) {
	if (ctx) return scopedDashboard(ctx);
	const month = monthKey();
	const today = todayISO();
	const in60 = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

	const [roll, units, expiring, tickets, feed, leasing, insurance, turns] = await Promise.all([
		rentRoll(orgId, month),
		db
			.select({ status: unit.status, n: sql<number>`count(*)`.mapWith(Number) })
			.from(unit)
			.where(eq(unit.organizationId, orgId))
			.groupBy(unit.status),
		db
			.select({ id: lease.id, endDate: lease.endDate, unitId: lease.unitId })
			.from(lease)
			.where(
				and(
					eq(lease.organizationId, orgId),
					eq(lease.status, 'active'),
					gte(lease.endDate, today),
					lte(lease.endDate, in60)
				)
			)
			.orderBy(lease.endDate),
		listTickets(orgId),
		db
			.select({
				id: activity.id,
				summary: activity.summary,
				entityType: activity.entityType,
				entityId: activity.entityId,
				action: activity.action,
				createdAt: activity.createdAt,
				actorName: user.name
			})
			.from(activity)
			.leftJoin(user, eq(user.id, activity.actorId))
			.where(eq(activity.organizationId, orgId))
			.orderBy(desc(activity.createdAt))
			.limit(12),
		leasingAttention(orgId),
		db
			.select({
				id: vendor.id,
				name: vendor.name,
				insuranceExpiresOn: vendor.insuranceExpiresOn
			})
			.from(vendor)
			.where(
				and(
					eq(vendor.organizationId, orgId),
					isNotNull(vendor.insuranceExpiresOn),
					isNull(vendor.archivedAt),
					lte(vendor.insuranceExpiresOn, addDays(today, INSURANCE_WARNING_DAYS))
				)
			)
			.orderBy(vendor.insuranceExpiresOn),
		db
			.select({ n: sql<number>`count(*)`.mapWith(Number) })
			.from(unitTurn)
			.where(and(eq(unitTurn.organizationId, orgId), isNull(unitTurn.completedAt)))
	]);

	const rent = roll.filter((r) => r.kind === 'rent');
	const totalUnits = units.reduce((s, u) => s + u.n, 0);
	const occupied = units.find((u) => u.status === 'occupied')?.n ?? 0;

	return {
		month,
		rent: {
			due: rent.reduce((s, r) => s + r.amount, 0),
			collected: rent.reduce((s, r) => s + Math.min(r.paid, r.amount), 0),
			overdue: roll.filter(
				(r) => r.status === 'overdue' || (r.status === 'partial' && r.dueDate < today)
			),
			paidCount: rent.filter((r) => r.status === 'paid').length,
			count: rent.length
		},
		occupancy: {
			total: totalUnits,
			occupied,
			vacant: units.find((u) => u.status === 'vacant')?.n ?? 0
		},
		expiringLeases: expiring.length,
		nextLeaseExpiryDays: expiring[0]
			? Math.ceil((new Date(expiring[0].endDate + 'T00:00:00Z').getTime() - Date.now()) / 86400_000)
			: null,
		openTickets: tickets
			.filter((t) => ['open', 'in_progress', 'on_hold'].includes(t.status))
			.slice(0, 6),
		urgentTickets: tickets.filter(
			(t) => t.priority === 'urgent' && !['done', 'cancelled'].includes(t.status)
		).length,
		insuranceAlerts: insurance,
		openTurns: turns[0]?.n ?? 0,
		feed,
		followUps: leasing.followUps.slice(0, 6),
		toursToday: leasing.tours,
		timezone: leasing.timezone
	};
}

async function scopedDashboard(ctx: OrgContext) {
	if (!ctx.perms && !ctx.propertyIds) return dashboard(ctx.orgId);
	const permitted = (r: ApiResource) => !ctx.perms || allows(ctx.perms, r, 'read');
	const month = monthKey();
	const today = todayISO();
	const [roll, units, leases, tickets, vendors, turns, leasing] = await Promise.all([
		permitted('charges') ? filterRecords(ctx, 'charges', await rentRoll(ctx.orgId, month)) : [],
		permitted('units') ? filterRecords(ctx, 'units', await listUnits(ctx.orgId)) : [],
		permitted('leases') ? filterRecords(ctx, 'leases', await listLeases(ctx.orgId)) : [],
		permitted('tickets') ? filterRecords(ctx, 'tickets', await listTickets(ctx.orgId)) : [],
		permitted('vendors') ? listVendors(ctx.orgId, {}, ctx) : [],
		permitted('turns') ? filterRecords(ctx, 'turns', await listTurns(ctx.orgId)) : [],
		permitted('leads')
			? leasingAttention(ctx.orgId, ctx)
			: { followUps: [], tours: [], timezone: 'UTC' }
	]);
	const rent = roll.filter((r) => r.kind === 'rent');
	const expiring = leases
		.filter(
			(l) =>
				l.status === 'active' && l.endDate && l.endDate >= today && l.endDate <= addDays(today, 60)
		)
		.sort((a, b) => a.endDate!.localeCompare(b.endDate!));
	// Activity summaries may embed multiple resources. Unclassified feed rows stay owner/admin-only.
	return {
		month,
		rent: {
			due: rent.reduce((n, r) => n + r.amount, 0),
			collected: rent.reduce((n, r) => n + Math.min(r.paid, r.amount), 0),
			overdue: roll.filter(
				(r) => r.status === 'overdue' || (r.status === 'partial' && r.dueDate < today)
			),
			paidCount: rent.filter((r) => r.status === 'paid').length,
			count: rent.length
		},
		occupancy: {
			total: units.length,
			occupied: units.filter((u) => u.status === 'occupied').length,
			vacant: units.filter((u) => u.status === 'vacant').length
		},
		expiringLeases: expiring.length,
		nextLeaseExpiryDays: expiring[0]
			? Math.ceil(
					(new Date(expiring[0].endDate! + 'T00:00:00Z').getTime() - Date.now()) / 86400_000
				)
			: null,
		openTickets: tickets
			.filter((t) => ['open', 'in_progress', 'on_hold'].includes(t.status))
			.slice(0, 6),
		urgentTickets: tickets.filter(
			(t) => t.priority === 'urgent' && !['done', 'cancelled'].includes(t.status)
		).length,
		insuranceAlerts: vendors.filter(
			(v) => v.insuranceExpiresOn && v.insuranceExpiresOn <= addDays(today, INSURANCE_WARNING_DAYS)
		),
		openTurns: turns.filter((t) => !t.completedAt).length,
		feed: !ctx.perms && !ctx.propertyIds ? (await dashboard(ctx.orgId)).feed : [],
		followUps: leasing.followUps.slice(0, 6),
		toursToday: leasing.tours,
		timezone: leasing.timezone
	};
}
