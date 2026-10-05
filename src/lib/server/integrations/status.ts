import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	integrationConnection,
	integrationLink,
	lease,
	payment,
	tenant
} from '#lib/server/db/schema.ts';

export async function connectionStatus(orgId: string, integrationId: string) {
	const [row] = await db
		.select()
		.from(integrationConnection)
		.where(
			and(
				eq(integrationConnection.organizationId, orgId),
				eq(integrationConnection.integrationId, integrationId)
			)
		);
	if (!row) return null;
	const counts = await db
		.select({ status: integrationLink.status, n: sql<number>`count(*)::int` })
		.from(integrationLink)
		.where(
			and(
				eq(integrationLink.organizationId, orgId),
				eq(integrationLink.integrationId, integrationId),
				eq(integrationLink.account, row.account)
			)
		)
		.groupBy(integrationLink.status);
	const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
	return {
		status: row.status,
		accountName: row.accountName,
		connectedAt: row.createdAt.toISOString(),
		syncing: !!row.syncStartedAt && row.syncStartedAt.getTime() > Date.now() - 10 * 60_000,
		lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
		lastSyncResult: row.lastSyncResult,
		lastError: row.lastError,
		counts: { synced: count('synced'), skipped: count('skipped'), failed: count('failed') }
	};
}

export type SyncIssue = {
	id: string;
	type: 'tenant' | 'charge' | 'payment';
	status: 'skipped' | 'failed' | 'synced';
	error: string;
	label: string;
	detail: string | null;
	amount: number | null;
	currency: string | null;
	href: string | null;
	updatedAt: string;
};

/** Records that failed or were skipped in the latest attempt, newest first. */
export async function syncIssues(orgId: string, integrationId: string): Promise<SyncIssue[]> {
	const [conn] = await db
		.select({ account: integrationConnection.account })
		.from(integrationConnection)
		.where(
			and(
				eq(integrationConnection.organizationId, orgId),
				eq(integrationConnection.integrationId, integrationId)
			)
		);
	if (!conn) return [];
	const links = await db
		.select()
		.from(integrationLink)
		.where(
			and(
				eq(integrationLink.organizationId, orgId),
				eq(integrationLink.integrationId, integrationId),
				eq(integrationLink.account, conn.account),
				// Synced rows only appear here when removing them failed.
				ne(integrationLink.status, 'synced')
			)
		)
		.orderBy(desc(integrationLink.status), desc(integrationLink.updatedAt))
		.limit(100);
	const failedRemovals = await db
		.select()
		.from(integrationLink)
		.where(
			and(
				eq(integrationLink.organizationId, orgId),
				eq(integrationLink.integrationId, integrationId),
				eq(integrationLink.account, conn.account),
				eq(integrationLink.status, 'synced'),
				sql`${integrationLink.error} is not null`
			)
		)
		.limit(20);
	const all = [...failedRemovals, ...links];
	const ids = (t: string) => all.filter((l) => l.entityType === t).map((l) => l.entityId);

	const [tenants, charges, payments] = await Promise.all([
		ids('tenant').length
			? db
					.select({
						id: tenant.id,
						first: tenant.firstName,
						last: tenant.lastName,
						company: tenant.companyName
					})
					.from(tenant)
					.where(and(eq(tenant.organizationId, orgId), inArray(tenant.id, ids('tenant'))))
			: [],
		ids('charge').length
			? db
					.select({
						id: charge.id,
						leaseId: charge.leaseId,
						kind: charge.kind,
						description: charge.description,
						dueDate: charge.dueDate,
						amount: charge.amount,
						currency: lease.currency
					})
					.from(charge)
					.innerJoin(lease, eq(lease.id, charge.leaseId))
					.where(and(eq(charge.organizationId, orgId), inArray(charge.id, ids('charge'))))
			: [],
		ids('payment').length
			? db
					.select({
						id: payment.id,
						leaseId: payment.leaseId,
						receivedOn: payment.receivedOn,
						amount: payment.amount,
						currency: lease.currency
					})
					.from(payment)
					.innerJoin(lease, eq(lease.id, payment.leaseId))
					.where(and(eq(payment.organizationId, orgId), inArray(payment.id, ids('payment'))))
			: []
	]);

	return all.map((l): SyncIssue => {
		const base = {
			id: l.id,
			type: l.entityType,
			status: l.status,
			error: l.error ?? '',
			updatedAt: l.updatedAt.toISOString()
		};
		if (l.entityType === 'tenant') {
			const t = tenants.find((x) => x.id === l.entityId);
			return {
				...base,
				label: t ? t.company || `${t.first} ${t.last}`.trim() : 'Deleted tenant',
				detail: 'Tenant',
				amount: null,
				currency: null,
				href: t ? `/tenants/${t.id}` : null
			};
		}
		if (l.entityType === 'charge') {
			const c = charges.find((x) => x.id === l.entityId);
			return {
				...base,
				label: c
					? c.description || `${c.kind[0]!.toUpperCase()}${c.kind.slice(1)} charge`
					: 'Deleted charge',
				detail: c ? `Due ${c.dueDate}` : null,
				amount: c?.amount ?? null,
				currency: c?.currency ?? null,
				href: c ? `/leases/${c.leaseId}` : null
			};
		}
		const p = payments.find((x) => x.id === l.entityId);
		return {
			...base,
			label: p ? 'Payment' : 'Deleted payment',
			detail: p ? `Received ${p.receivedOn}` : null,
			amount: p?.amount ?? null,
			currency: p?.currency ?? null,
			href: p ? `/leases/${p.leaseId}` : null
		};
	});
}
