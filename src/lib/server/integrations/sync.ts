import { and, asc, eq, gte, inArray, isNull, lt, ne, or, sql, type Column } from 'drizzle-orm';
import type {
	PushResult,
	SyncCharge,
	SyncContext,
	SyncEntityType,
	SyncPayment,
	SyncRecords,
	SyncTenant
} from '@leroa/integration-sdk';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	integrationConnection,
	integrationInstall,
	integrationLink,
	lease,
	leaseTenant,
	organization,
	payment,
	property,
	tenant,
	unit
} from '#lib/server/db/schema.ts';
import { boundedFetch, getIntegration } from './runtime.ts';
import { connectionFor, type OAuthIntegration } from './oauth.ts';

export type SyncSummary = {
	synced: number;
	skipped: number;
	failed: number;
	removed: number;
	remaining: number;
	error?: string;
};

/** Records pushed per run; the rest go next run. */
const BATCH = 500;
/** A run that hasn't finished after this long is assumed dead. */
const LOCK_MS = 10 * 60_000;

const isFatal = (err: unknown) => (err as Error | undefined)?.name === 'SyncFatalError';
const message = (err: unknown) =>
	(err instanceof Error ? err.message : String(err)).slice(0, 500) || 'Unknown error';

type Scope = { orgId: string; integrationId: string; account: string };

const linkOn = (s: Scope, type: SyncEntityType, entityId: Column) =>
	and(
		eq(integrationLink.organizationId, s.orgId),
		eq(integrationLink.integrationId, s.integrationId),
		eq(integrationLink.account, s.account),
		eq(integrationLink.entityType, type),
		eq(integrationLink.entityId, entityId)
	);

const unsynced = or(isNull(integrationLink.id), ne(integrationLink.status, 'synced'));

const primaryTenant = sql<
	string | null
>`(select ${leaseTenant.tenantId} from ${leaseTenant} where ${leaseTenant.leaseId} = ${lease.id} order by ${leaseTenant.isPrimary} desc, ${leaseTenant.tenantId} limit 1)`;

function pendingCharges(s: Scope, since: string | null) {
	return db
		.select({
			id: charge.id,
			leaseId: charge.leaseId,
			tenantId: primaryTenant,
			kind: charge.kind,
			description: charge.description,
			periodStart: charge.periodStart,
			dueDate: charge.dueDate,
			amount: charge.amount,
			currency: lease.currency,
			property: property.name,
			unit: unit.name
		})
		.from(charge)
		.innerJoin(lease, eq(lease.id, charge.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.leftJoin(integrationLink, linkOn(s, 'charge', charge.id))
		.where(
			and(
				eq(charge.organizationId, s.orgId),
				since ? gte(charge.dueDate, since) : undefined,
				unsynced
			)
		)
		.orderBy(asc(charge.dueDate), asc(charge.createdAt));
}

function pendingPayments(s: Scope, since: string | null) {
	return db
		.select({
			id: payment.id,
			leaseId: payment.leaseId,
			tenantId: primaryTenant,
			chargeId: payment.chargeId,
			chargeKind: charge.kind,
			chargeDueDate: charge.dueDate,
			amount: payment.amount,
			currency: lease.currency,
			receivedOn: payment.receivedOn,
			method: payment.method,
			reference: payment.reference
		})
		.from(payment)
		.innerJoin(lease, eq(lease.id, payment.leaseId))
		.leftJoin(charge, eq(charge.id, payment.chargeId))
		.leftJoin(integrationLink, linkOn(s, 'payment', payment.id))
		.where(
			and(
				eq(payment.organizationId, s.orgId),
				since ? gte(payment.receivedOn, since) : undefined,
				unsynced
			)
		)
		.orderBy(asc(payment.receivedOn), asc(payment.createdAt));
}

async function loadTenants(orgId: string, ids: string[]): Promise<SyncTenant[]> {
	if (!ids.length) return [];
	const rows = await db
		.select()
		.from(tenant)
		.where(and(eq(tenant.organizationId, orgId), inArray(tenant.id, ids)));
	return rows.map((t) => ({
		id: t.id,
		name:
			t.kind === 'company' && t.companyName ? t.companyName : `${t.firstName} ${t.lastName}`.trim(),
		firstName: t.firstName,
		lastName: t.lastName,
		companyName: t.kind === 'company' ? t.companyName : null,
		email: t.email,
		phone: t.phone
	}));
}

async function saveLink(
	s: Scope,
	type: SyncEntityType,
	entityId: string,
	result: { externalId: string } | { status: 'skipped' | 'failed'; error: string }
) {
	const values =
		'externalId' in result
			? { externalId: result.externalId, status: 'synced' as const, error: null }
			: { externalId: null, status: result.status, error: result.error.slice(0, 500) };
	await db
		.insert(integrationLink)
		.values({
			organizationId: s.orgId,
			integrationId: s.integrationId,
			account: s.account,
			entityType: type,
			entityId,
			...values
		})
		.onConflictDoUpdate({
			target: [
				integrationLink.organizationId,
				integrationLink.integrationId,
				integrationLink.account,
				integrationLink.entityType,
				integrationLink.entityId
			],
			set: values
		});
}

type Queued = {
	[T in SyncEntityType]: [T, SyncRecords[T] & { tenantId?: string | null }];
}[SyncEntityType];

/**
 * Pushes everything not yet synced (tenants, then charges, then payments, so each can refer to
 * the last) and removes synced payments that were deleted in Leroa. Returns null when the
 * integration isn't connected and enabled, or another run is in progress.
 */
export async function runSync(orgId: string, integrationId: string): Promise<SyncSummary | null> {
	const def = getIntegration(integrationId);
	if (!def?.sync || !def.oauth) return null;
	const [install] = await db
		.select()
		.from(integrationInstall)
		.where(
			and(
				eq(integrationInstall.organizationId, orgId),
				eq(integrationInstall.integrationId, integrationId)
			)
		);
	if (!install?.enabled) return null;

	const now = new Date();
	const [row] = await db
		.update(integrationConnection)
		.set({ syncStartedAt: now })
		.where(
			and(
				eq(integrationConnection.organizationId, orgId),
				eq(integrationConnection.integrationId, integrationId),
				eq(integrationConnection.status, 'connected'),
				or(
					isNull(integrationConnection.syncStartedAt),
					lt(integrationConnection.syncStartedAt, new Date(now.getTime() - LOCK_MS))
				)
			)
		)
		.returning();
	if (!row) return null;

	const scope: Scope = { orgId, integrationId, account: row.account };
	const summary: SyncSummary = { synced: 0, skipped: 0, failed: 0, removed: 0, remaining: 0 };
	try {
		const connection = await connectionFor(def as OAuthIntegration, row);
		const [org] = await db
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, orgId));
		const config = install.config;
		const since = def.sync.since?.(config) ?? null;

		const links = await db
			.select({
				entityType: integrationLink.entityType,
				entityId: integrationLink.entityId,
				externalId: integrationLink.externalId
			})
			.from(integrationLink)
			.where(
				and(
					eq(integrationLink.organizationId, orgId),
					eq(integrationLink.integrationId, integrationId),
					eq(integrationLink.account, row.account),
					eq(integrationLink.status, 'synced')
				)
			);
		const external = new Map(
			links.map((l) => [`${l.entityType}:${l.entityId}`, l.externalId ?? ''])
		);
		const ctx: SyncContext<Record<string, unknown>> = {
			config,
			workspace: { id: orgId, name: org?.name ?? '' },
			fetch: boundedFetch,
			log: (...args) => console.log(`[integration:${def.id}]`, ...args),
			connection,
			externalId: (type, id) => external.get(`${type}:${id}`) || undefined,
			cache: new Map()
		};

		const charges = await pendingCharges(scope, since);
		const payments = await pendingPayments(scope, since);
		const tenantIds = new Set<string>();
		for (const r of [...charges, ...payments])
			if (r.tenantId && !external.has(`tenant:${r.tenantId}`)) tenantIds.add(r.tenantId);
		const tenants = await loadTenants(orgId, [...tenantIds]);

		const queue: Queued[] = [
			...tenants.map((t): Queued => ['tenant', t]),
			...charges.map((c): Queued => ['charge', c as SyncCharge]),
			...payments.map((p): Queued => ['payment', p as SyncPayment])
		];
		summary.remaining = Math.max(0, queue.length - BATCH);

		const batch = queue.slice(0, BATCH);
		for (let i = 0; i < batch.length; i++) {
			const [type, record] = batch[i]!;
			let result: PushResult;
			try {
				if (type !== 'tenant' && !record.tenantId) throw new Error('The lease has no tenant');
				const p = record as SyncPayment;
				if (type === 'payment' && since && p.chargeDueDate && p.chargeDueDate < since)
					result = { skip: 'Paid toward a charge due before the sync start date' };
				else result = await def.sync.push(type, record as never, ctx);
			} catch (err) {
				if (isFatal(err)) {
					summary.error = message(err);
					summary.remaining += batch.length - i;
					break;
				}
				await saveLink(scope, type, record.id, { status: 'failed', error: message(err) });
				summary.failed++;
				continue;
			}
			if ('externalId' in result) {
				external.set(`${type}:${record.id}`, result.externalId);
				await saveLink(scope, type, record.id, { externalId: result.externalId });
				summary.synced++;
			} else {
				await saveLink(scope, type, record.id, { status: 'skipped', error: result.skip });
				summary.skipped++;
			}
		}

		if (!summary.error) {
			const orphans = await db
				.select({
					id: integrationLink.id,
					externalId: integrationLink.externalId,
					status: integrationLink.status
				})
				.from(integrationLink)
				.leftJoin(payment, eq(payment.id, integrationLink.entityId))
				.where(
					and(
						eq(integrationLink.organizationId, orgId),
						eq(integrationLink.integrationId, integrationId),
						eq(integrationLink.account, row.account),
						eq(integrationLink.entityType, 'payment'),
						isNull(payment.id)
					)
				);
			for (const o of orphans) {
				try {
					if (o.status === 'synced' && o.externalId)
						await def.sync.remove?.('payment', o.externalId, ctx);
					await db.delete(integrationLink).where(eq(integrationLink.id, o.id));
					if (o.status === 'synced') summary.removed++;
				} catch (err) {
					if (isFatal(err)) {
						summary.error = message(err);
						break;
					}
					await db
						.update(integrationLink)
						.set({ error: `Deleted in Leroa, but not in ${def.name}: ${message(err)}` })
						.where(eq(integrationLink.id, o.id));
					summary.failed++;
				}
			}
		}
	} catch (err) {
		summary.error = message(err);
		if (!isFatal(err)) console.error(`[integration:${integrationId}] sync failed`, err);
	} finally {
		const { error: lastError, ...result } = summary;
		await db
			.update(integrationConnection)
			.set({
				syncStartedAt: null,
				lastSyncAt: new Date(),
				lastSyncResult: result,
				lastError: lastError ?? null
			})
			.where(
				and(
					eq(integrationConnection.organizationId, orgId),
					eq(integrationConnection.integrationId, integrationId)
				)
			);
	}
	return summary;
}

/** Daily job: syncs every connected, enabled integration. */
export async function syncAllConnections() {
	const rows = await db
		.select({
			orgId: integrationConnection.organizationId,
			integrationId: integrationConnection.integrationId
		})
		.from(integrationConnection)
		.innerJoin(
			integrationInstall,
			and(
				eq(integrationInstall.organizationId, integrationConnection.organizationId),
				eq(integrationInstall.integrationId, integrationConnection.integrationId)
			)
		)
		.where(
			and(eq(integrationConnection.status, 'connected'), eq(integrationInstall.enabled, true))
		);
	let failed = 0;
	for (const r of rows) {
		const result = await runSync(r.orgId, r.integrationId).catch(() => null);
		if (result?.error) failed++;
	}
	return { connections: rows.length, failed };
}
