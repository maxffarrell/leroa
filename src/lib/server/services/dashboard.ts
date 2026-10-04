import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { activity, lease, unit, user } from '#lib/server/db/schema.ts';
import { monthKey, todayISO } from '#lib/format.ts';
import { rentRoll } from './leasing.ts';
import { listTickets } from './maintenance.ts';

export async function dashboard(orgId: string) {
	const month = monthKey();
	const today = todayISO();
	const in60 = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

	const [roll, units, expiring, tickets, feed] = await Promise.all([
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
			.limit(12)
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
		openTickets: tickets
			.filter((t) => ['open', 'in_progress', 'on_hold'].includes(t.status))
			.slice(0, 6),
		urgentTickets: tickets.filter(
			(t) => t.priority === 'urgent' && !['done', 'cancelled'].includes(t.status)
		).length,
		feed
	};
}
