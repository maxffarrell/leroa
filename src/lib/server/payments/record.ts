import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { charge, payment } from '#lib/server/db/schema.ts';
import { allocate } from '#lib/server/allocation.ts';
import { formatMoney, todayISO } from '#lib/format.ts';
import { emit } from '#lib/server/services/events.ts';

type OnlinePayment = {
	orgId: string;
	leaseId: string;
	/** Minor units. */
	amount: number;
	method: (typeof payment.$inferInsert)['method'];
	/** Provider-unique payment ID; recording the same ID twice is a no-op. */
	externalId: string;
	provider: string;
};

/**
 * Records a provider-confirmed payment, applied to the lease's open charges oldest-first.
 * Safe to call more than once for the same `externalId`.
 */
export async function recordOnlinePayment(p: OnlinePayment) {
	if (p.amount <= 0) return;
	const l = await db.query.lease.findFirst({
		where: (l, { and, eq }) => and(eq(l.organizationId, p.orgId), eq(l.id, p.leaseId))
	});
	if (!l) return;
	const today = todayISO();

	const rows = await db.transaction(async (tx) => {
		const open = await tx
			.select({
				id: charge.id,
				open: sql<number>`${charge.amount} - coalesce((select sum(p.amount) from ${payment} p where p.charge_id = "charge"."id"), 0)`.mapWith(
					Number
				)
			})
			.from(charge)
			.where(and(eq(charge.leaseId, p.leaseId), lte(charge.dueDate, today)))
			.orderBy(asc(charge.dueDate), asc(charge.createdAt));
		const inserted = [];
		for (const [i, part] of allocate(p.amount, open).entries()) {
			const [row] = await tx
				.insert(payment)
				.values({
					organizationId: p.orgId,
					leaseId: p.leaseId,
					chargeId: part.chargeId,
					amount: part.amount,
					receivedOn: today,
					method: p.method,
					reference: p.externalId,
					notes: `Paid online with ${p.provider}`,
					// The unique index on the first part makes replayed webhooks a no-op.
					externalId: i === 0 ? p.externalId : `${p.externalId}:${i}`
				})
				.onConflictDoNothing()
				.returning();
			if (!row) return [];
			inserted.push(row);
		}
		return inserted;
	});
	const first = rows[0];
	if (!first) return;
	await emit({
		orgId: p.orgId,
		entityType: 'payment',
		entityId: first.id,
		action: 'recorded',
		summary: `${formatMoney(p.amount, l.currency)} paid online with ${p.provider}`,
		data: {
			leaseId: p.leaseId,
			amount: p.amount,
			method: p.method,
			online: true,
			payments: rows.map((r) => r.id)
		}
	});
}
