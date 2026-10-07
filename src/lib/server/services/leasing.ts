import { and, asc, desc, eq, getTableName, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	lease,
	leaseTenant,
	payment,
	property,
	tenant,
	unit
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type {
	chargeInput,
	leaseInput,
	leaseRenewal,
	leaseUpdate,
	paymentInput
} from '#lib/schemas.ts';
import { addDays, formatMoney, monthLabel, nextMonth, tenantName, todayISO } from '#lib/format.ts';
import { emit } from './events.ts';
import { sendRentNotifications } from './notifications.ts';
import { autoStartTurn, completeTurnsForUnit } from './turns.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

/** Table-qualified column for correlated subqueries; Drizzle omits the qualifier on single-table selects. */
export const outer = (column: AnyPgColumn) =>
	sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;

export const tenantNames = sql<string>`coalesce((
	select string_agg(case when ${tenant.kind} = 'company' and ${tenant.companyName} is not null then ${tenant.companyName} else trim(${tenant.firstName} || ' ' || ${tenant.lastName}) end, ', ' order by ${leaseTenant.isPrimary} desc)
	from ${leaseTenant} join ${tenant} on ${tenant.id} = ${leaseTenant.tenantId}
	where ${leaseTenant.leaseId} = ${outer(lease.id)}
), '')`;

export const balanceSql = sql<number>`(
	coalesce((select sum(${charge.amount}) from ${charge} where ${charge.leaseId} = ${outer(lease.id)} and ${charge.dueDate} <= current_date), 0)
	- coalesce((select sum(${payment.amount}) from ${payment} where ${payment.leaseId} = ${outer(lease.id)}), 0)
)`.mapWith(Number);

export async function listLeases(
	orgId: string,
	status?: (typeof lease.status.enumValues)[number][]
) {
	return db
		.select({
			id: lease.id,
			status: lease.status,
			startDate: lease.startDate,
			endDate: lease.endDate,
			rentAmount: lease.rentAmount,
			currency: lease.currency,
			unitId: unit.id,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name,
			tenants: tenantNames,
			balance: balanceSql
		})
		.from(lease)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(
				eq(lease.organizationId, orgId),
				status?.length ? inArray(lease.status, status) : undefined
			)
		)
		.orderBy(sql`${lease.status} = 'active' desc`, asc(property.name), asc(unit.name));
}

export async function getLease(orgId: string, id: string) {
	await runRentAutomation(orgId);
	const [row] = await db
		.select({
			lease,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name,
			balance: balanceSql
		})
		.from(lease)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(lease.organizationId, orgId), eq(lease.id, id)));
	if (!row) error(404, 'Lease not found');

	const [tenants, charges, payments, renewal] = await Promise.all([
		db
			.select({
				id: tenant.id,
				kind: tenant.kind,
				firstName: tenant.firstName,
				lastName: tenant.lastName,
				companyName: tenant.companyName,
				email: tenant.email,
				phone: tenant.phone,
				isPrimary: leaseTenant.isPrimary
			})
			.from(leaseTenant)
			.innerJoin(tenant, eq(tenant.id, leaseTenant.tenantId))
			.where(eq(leaseTenant.leaseId, id))
			.orderBy(desc(leaseTenant.isPrimary)),
		db
			.select({
				id: charge.id,
				kind: charge.kind,
				description: charge.description,
				dueDate: charge.dueDate,
				amount: charge.amount,
				paid: sql<number>`coalesce((select sum(${payment.amount}) from ${payment} where ${payment.chargeId} = ${outer(charge.id)}), 0)`.mapWith(
					Number
				)
			})
			.from(charge)
			.where(eq(charge.leaseId, id))
			.orderBy(desc(charge.dueDate)),
		db
			.select()
			.from(payment)
			.where(eq(payment.leaseId, id))
			.orderBy(desc(payment.receivedOn), desc(payment.createdAt)),
		db.query.lease.findFirst({
			columns: { id: true },
			where: (l, { and, eq, ne }) =>
				and(eq(l.organizationId, orgId), eq(l.renewedFromId, id), ne(l.status, 'terminated'))
		})
	]);

	return {
		...row.lease,
		unitName: row.unitName,
		propertyId: row.propertyId,
		propertyName: row.propertyName,
		balance: row.balance,
		renewedById: renewal?.id ?? null,
		tenants,
		charges,
		payments
	};
}

export async function createLease(ctx: OrgContext, input: Out<typeof leaseInput>) {
	const { tenantIds, ...data } = input;
	const u = await db.query.unit.findFirst({
		where: (u, { and, eq }) => and(eq(u.organizationId, ctx.orgId), eq(u.id, data.unitId))
	});
	if (!u) error(404, 'Unit not found');
	const owned = await db
		.select({ id: tenant.id })
		.from(tenant)
		.where(and(eq(tenant.organizationId, ctx.orgId), inArray(tenant.id, tenantIds)));
	if (owned.length !== new Set(tenantIds).size) error(400, 'Unknown tenant');
	if (data.endDate && data.endDate < data.startDate)
		error(400, 'End date must be after the start date');

	const created = await db.transaction(async (tx) => {
		const [l] = await tx
			.insert(lease)
			.values({ ...data, organizationId: ctx.orgId })
			.returning();
		await tx
			.insert(leaseTenant)
			.values(tenantIds.map((tenantId, i) => ({ leaseId: l!.id, tenantId, isPrimary: i === 0 })));
		if (l!.status === 'active') {
			await tx.update(unit).set({ status: 'occupied' }).where(eq(unit.id, u.id));
			if (l!.depositAmount > 0) {
				await tx.insert(charge).values({
					organizationId: ctx.orgId,
					leaseId: l!.id,
					kind: 'deposit',
					description: 'Security deposit',
					dueDate: l!.startDate,
					amount: l!.depositAmount
				});
			}
		}
		return l!;
	});
	if (created.status === 'active') {
		await ensureRentCharges(ctx.orgId, created.startDate.slice(0, 7));
		await completeTurnsForUnit(ctx, created.unitId);
	}
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: created.id,
		action: 'created',
		summary: `New lease for unit ${u.name} at ${formatMoney(created.rentAmount, created.currency)}/mo`
	});
	return created;
}

export async function updateLease(ctx: OrgContext, { id, ...data }: Out<typeof leaseUpdate>) {
	const [before] = await db
		.select({ status: lease.status })
		.from(lease)
		.where(and(eq(lease.organizationId, ctx.orgId), eq(lease.id, id)));
	const [l] = await db
		.update(lease)
		.set(data)
		.where(and(eq(lease.organizationId, ctx.orgId), eq(lease.id, id)))
		.returning();
	if (!l) error(404, 'Lease not found');
	if (data.lateFeeAmount !== undefined || data.lateFeeGraceDays !== undefined) {
		await runRentAutomation(ctx.orgId, true);
	}
	if (data.status) {
		const occupied = data.status === 'active';
		const vacated = data.status === 'ended' || data.status === 'terminated';
		if (occupied || vacated)
			await db
				.update(unit)
				.set({ status: occupied ? 'occupied' : 'vacant' })
				.where(eq(unit.id, l.unitId));
		if (occupied && before?.status === 'draft') await activateDraft(ctx.orgId, l);
		if (occupied) await completeTurnsForUnit(ctx, l.unitId);
		if (vacated) await autoStartTurn(ctx, l);
	}
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: id,
		action: 'updated',
		summary: data.status ? `Lease marked ${data.status}` : 'Lease updated'
	});
	return l;
}

/** A draft that goes active gets the deposit charge and rent that `createLease` adds for active leases. */
async function activateDraft(orgId: string, l: typeof lease.$inferSelect) {
	if (l.depositAmount > 0) {
		const [existing] = await db
			.select({ id: charge.id })
			.from(charge)
			.where(and(eq(charge.leaseId, l.id), eq(charge.kind, 'deposit')));
		if (!existing)
			await db.insert(charge).values({
				organizationId: orgId,
				leaseId: l.id,
				kind: 'deposit',
				description: 'Security deposit',
				dueDate: l.startDate,
				amount: l.depositAmount
			});
	}
	await ensureRentCharges(orgId, l.startDate.slice(0, 7));
	await runRentAutomation(orgId, true);
}

type RentLease = { id: string; rentAmount: number; rentDueDay: number };

const rentCharge = (orgId: string, l: RentLease, month: string) => ({
	organizationId: orgId,
	leaseId: l.id,
	kind: 'rent' as const,
	description: `Rent ${monthLabel(month)}`,
	periodStart: `${month}-01`,
	dueDate: `${month}-${String(l.rentDueDay).padStart(2, '0')}`,
	amount: l.rentAmount
});

/** Creates the rent charge for every active monthly lease covering `month` (YYYY-MM). Idempotent. */
export async function ensureRentCharges(orgId: string, month: string) {
	const periodStart = `${month}-01`;
	const active = await db
		.select({ id: lease.id, rentAmount: lease.rentAmount, rentDueDay: lease.rentDueDay })
		.from(lease)
		.where(
			and(
				eq(lease.organizationId, orgId),
				eq(lease.status, 'active'),
				eq(lease.frequency, 'monthly'),
				lt(lease.startDate, `${nextMonth(month)}-01`),
				sql`(${lease.endDate} is null or ${lease.endDate} >= ${periodStart})`
			)
		);
	if (!active.length) return;
	await db
		.insert(charge)
		.values(active.map((l) => rentCharge(orgId, l, month)))
		.onConflictDoNothing();
}

/**
 * Posts rent for every month since each active lease was entered in Leroa (never back-filling
 * earlier history), up to the current month.
 */
async function catchUpRentCharges(orgId: string) {
	const today = todayISO();
	const current = today.slice(0, 7);
	const active = await db
		.select({
			id: lease.id,
			rentAmount: lease.rentAmount,
			rentDueDay: lease.rentDueDay,
			startDate: lease.startDate,
			endDate: lease.endDate,
			createdAt: lease.createdAt
		})
		.from(lease)
		.where(
			and(
				eq(lease.organizationId, orgId),
				eq(lease.status, 'active'),
				eq(lease.frequency, 'monthly'),
				lte(lease.startDate, today)
			)
		);
	const rows = active.flatMap((l) => {
		const out = [];
		const entered = l.createdAt.toISOString().slice(0, 7);
		const started = l.startDate.slice(0, 7);
		for (let m = started > entered ? started : entered; m <= current; m = nextMonth(m)) {
			if (l.endDate && l.endDate < `${m}-01`) break;
			out.push(rentCharge(orgId, l, m));
		}
		return out;
	});
	if (rows.length) await db.insert(charge).values(rows).onConflictDoNothing();
}

/** How far back late fees are assessed, so enabling a fee doesn't penalise old arrears. */
const LATE_FEE_LOOKBACK_DAYS = 45;

/**
 * Adds the lease's flat late fee once per rent charge that is still unpaid after the grace
 * period, as long as the lease as a whole is in arrears (covers unallocated payments).
 */
async function applyLateFees(orgId: string) {
	const today = todayISO();
	const late = await db
		.select({
			id: charge.id,
			leaseId: charge.leaseId,
			description: charge.description,
			fee: lease.lateFeeAmount
		})
		.from(charge)
		.innerJoin(lease, eq(lease.id, charge.leaseId))
		.where(
			and(
				eq(charge.organizationId, orgId),
				eq(charge.kind, 'rent'),
				eq(lease.status, 'active'),
				gt(lease.lateFeeAmount, 0),
				gte(charge.dueDate, addDays(today, -LATE_FEE_LOOKBACK_DAYS)),
				sql`${charge.dueDate} + ${lease.lateFeeGraceDays} < ${today}::date`,
				sql`${charge.amount} > coalesce((select sum(p.amount) from ${payment} p where p.charge_id = ${outer(charge.id)}), 0)`,
				sql`${balanceSql} > 0`
			)
		);
	if (!late.length) return;
	await db
		.insert(charge)
		.values(
			late.map((c) => ({
				organizationId: orgId,
				leaseId: c.leaseId,
				kind: 'fee' as const,
				description: `Late fee · ${c.description ?? 'Rent'}`,
				dueDate: today,
				amount: c.fee,
				appliesToChargeId: c.id
			}))
		)
		.onConflictDoNothing();
}

/** Ends leases whose term is over once their renewal has taken over. */
async function closeRenewedLeases(orgId: string) {
	await db
		.update(lease)
		.set({ status: 'ended' })
		.where(
			and(
				eq(lease.organizationId, orgId),
				eq(lease.status, 'active'),
				lt(lease.endDate, todayISO()),
				sql`exists (select 1 from ${lease} r where r.renewed_from_id = ${outer(lease.id)} and r.status = 'active')`
			)
		);
}

const AUTOMATION_INTERVAL_MS = 5 * 60 * 1000;
const lastAutomationRun = new Map<string, number>();

/** Rent posting, late fees and renewal hand-over. Runs lazily on reads, at most every few minutes. */
export async function runRentAutomation(orgId: string, force = false) {
	const now = Date.now();
	if (!force && now - (lastAutomationRun.get(orgId) ?? 0) < AUTOMATION_INTERVAL_MS) return;
	lastAutomationRun.set(orgId, now);
	await catchUpRentCharges(orgId);
	await applyLateFees(orgId);
	await closeRenewedLeases(orgId);
	void sendRentNotifications(orgId).catch((err) => console.error('rent notifications failed', err));
}

/** Starts a follow-on lease for the same unit and tenants; the current lease ends the day before. */
export async function renewLease(ctx: OrgContext, input: Out<typeof leaseRenewal>) {
	const current = await getLease(ctx.orgId, input.id);
	if (current.status !== 'active') error(400, 'Only active leases can be renewed');
	if (current.renewedById) error(409, 'This lease has already been renewed');
	if (input.startDate <= current.startDate)
		error(400, 'The renewal must start after the current lease');
	if (input.endDate && input.endDate < input.startDate)
		error(400, 'End date must be after the start date');

	const previousEnd = addDays(input.startDate, -1);
	const created = await db.transaction(async (tx) => {
		await tx
			.update(lease)
			.set({ endDate: previousEnd })
			.where(and(eq(lease.organizationId, ctx.orgId), eq(lease.id, current.id)));
		const [l] = await tx
			.insert(lease)
			.values({
				organizationId: ctx.orgId,
				unitId: current.unitId,
				status: 'active',
				startDate: input.startDate,
				endDate: input.endDate ?? null,
				rentAmount: input.rentAmount,
				depositAmount: 0,
				rentDueDay: current.rentDueDay,
				frequency: current.frequency,
				currency: current.currency,
				lateFeeAmount: current.lateFeeAmount,
				lateFeeGraceDays: current.lateFeeGraceDays,
				renewedFromId: current.id
			})
			.returning();
		await tx
			.insert(leaseTenant)
			.values(
				current.tenants.map((t) => ({ leaseId: l!.id, tenantId: t.id, isPrimary: t.isPrimary }))
			);
		return l!;
	});
	await runRentAutomation(ctx.orgId, true);
	const change = input.rentAmount - current.rentAmount;
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: created.id,
		action: 'renewed',
		summary: `Lease for unit ${current.unitName} renewed at ${formatMoney(created.rentAmount, created.currency)}/mo${change ? ` (${change > 0 ? '+' : '−'}${formatMoney(Math.abs(change), created.currency)})` : ''}`
	});
	return created;
}

export type RentRow = Awaited<ReturnType<typeof rentRoll>>[number];

/** Every charge due in `month` with what has been paid against it. */
export async function rentRoll(orgId: string, month: string) {
	await runRentAutomation(orgId);
	await ensureRentCharges(orgId, month);
	const start = `${month}-01`;
	const [y, m] = month.split('-').map(Number) as [number, number];
	const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

	const rows = await db
		.select({
			id: charge.id,
			kind: charge.kind,
			description: charge.description,
			dueDate: charge.dueDate,
			amount: charge.amount,
			paid: sql<number>`coalesce((select sum(${payment.amount}) from ${payment} where ${payment.chargeId} = ${outer(charge.id)}), 0)`.mapWith(
				Number
			),
			lastPaidOn: sql<
				string | null
			>`(select max(${payment.receivedOn}) from ${payment} where ${payment.chargeId} = ${outer(charge.id)})`,
			leaseId: lease.id,
			currency: lease.currency,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name,
			tenants: tenantNames
		})
		.from(charge)
		.innerJoin(lease, eq(lease.id, charge.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(eq(charge.organizationId, orgId), gte(charge.dueDate, start), lte(charge.dueDate, end))
		)
		.orderBy(asc(property.name), sql`length(${unit.name})`, asc(unit.name), asc(charge.dueDate));

	const today = todayISO();
	return rows.map((r) => ({
		...r,
		balance: r.amount - r.paid,
		status: (r.paid >= r.amount
			? 'paid'
			: r.paid > 0
				? 'partial'
				: r.dueDate < today
					? 'overdue'
					: 'due') as 'paid' | 'partial' | 'overdue' | 'due'
	}));
}

export async function addCharge(ctx: OrgContext, input: Out<typeof chargeInput>) {
	const l = await db.query.lease.findFirst({
		where: (l, { and, eq }) => and(eq(l.organizationId, ctx.orgId), eq(l.id, input.leaseId))
	});
	if (!l) error(404, 'Lease not found');
	const [c] = await db
		.insert(charge)
		.values({ ...input, organizationId: ctx.orgId })
		.returning();
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'charge',
		entityId: c!.id,
		action: 'created',
		summary: `Charged ${formatMoney(c!.amount, l.currency)} (${c!.kind})`
	});
	return c!;
}

export async function recordPayment(ctx: OrgContext, input: Out<typeof paymentInput>) {
	const l = await db.query.lease.findFirst({
		where: (l, { and, eq }) => and(eq(l.organizationId, ctx.orgId), eq(l.id, input.leaseId))
	});
	if (!l) error(404, 'Lease not found');
	if (input.chargeId) {
		const c = await db.query.charge.findFirst({
			where: (c, { and, eq }) => and(eq(c.leaseId, l.id), eq(c.id, input.chargeId!))
		});
		if (!c) error(404, 'Charge not found');
	}
	const [p] = await db
		.insert(payment)
		.values({ ...input, organizationId: ctx.orgId, recordedBy: ctx.userId })
		.returning();
	const [primary] = await db
		.select({
			kind: tenant.kind,
			firstName: tenant.firstName,
			lastName: tenant.lastName,
			companyName: tenant.companyName
		})
		.from(leaseTenant)
		.innerJoin(tenant, eq(tenant.id, leaseTenant.tenantId))
		.where(eq(leaseTenant.leaseId, l.id))
		.orderBy(desc(leaseTenant.isPrimary))
		.limit(1);
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'payment',
		entityId: p!.id,
		action: 'recorded',
		summary: `${formatMoney(p!.amount, l.currency)} received${primary ? ` from ${tenantName(primary)}` : ''}`,
		data: { leaseId: l.id, amount: p!.amount, method: p!.method }
	});
	return p!;
}

export async function deletePayment(ctx: OrgContext, id: string) {
	const [p] = await db
		.delete(payment)
		.where(and(eq(payment.organizationId, ctx.orgId), eq(payment.id, id)))
		.returning();
	if (!p) error(404, 'Payment not found');
}
