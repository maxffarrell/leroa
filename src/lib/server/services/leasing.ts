import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
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
import type { chargeInput, leaseInput, leaseUpdate, paymentInput } from '#lib/schemas.ts';
import { formatMoney, tenantName, todayISO } from '#lib/format.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const tenantNames = sql<string>`coalesce((
	select string_agg(case when ${tenant.kind} = 'company' and ${tenant.companyName} is not null then ${tenant.companyName} else trim(${tenant.firstName} || ' ' || ${tenant.lastName}) end, ', ' order by ${leaseTenant.isPrimary} desc)
	from ${leaseTenant} join ${tenant} on ${tenant.id} = ${leaseTenant.tenantId}
	where ${leaseTenant.leaseId} = ${lease.id}
), '')`;

const balanceSql = sql<number>`(
	coalesce((select sum(${charge.amount}) from ${charge} where ${charge.leaseId} = ${lease.id} and ${charge.dueDate} <= current_date), 0)
	- coalesce((select sum(${payment.amount}) from ${payment} where ${payment.leaseId} = ${lease.id}), 0)
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

	const [tenants, charges, payments] = await Promise.all([
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
				paid: sql<number>`coalesce((select sum(${payment.amount}) from ${payment} where ${payment.chargeId} = ${charge.id}), 0)`.mapWith(
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
			.orderBy(desc(payment.receivedOn), desc(payment.createdAt))
	]);

	return {
		...row.lease,
		unitName: row.unitName,
		propertyId: row.propertyId,
		propertyName: row.propertyName,
		balance: row.balance,
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
	if (created.status === 'active')
		await ensureRentCharges(ctx.orgId, created.startDate.slice(0, 7));
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
	const [l] = await db
		.update(lease)
		.set(data)
		.where(and(eq(lease.organizationId, ctx.orgId), eq(lease.id, id)))
		.returning();
	if (!l) error(404, 'Lease not found');
	if (data.status) {
		const occupied = data.status === 'active';
		const vacated = data.status === 'ended' || data.status === 'terminated';
		if (occupied || vacated)
			await db
				.update(unit)
				.set({ status: occupied ? 'occupied' : 'vacant' })
				.where(eq(unit.id, l.unitId));
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

/** Creates the rent charge for every active monthly lease covering `month` (YYYY-MM). Idempotent. */
export async function ensureRentCharges(orgId: string, month: string) {
	const periodStart = `${month}-01`;
	const [y, m] = month.split('-').map(Number) as [number, number];
	const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
	const active = await db
		.select({ id: lease.id, rentAmount: lease.rentAmount, rentDueDay: lease.rentDueDay })
		.from(lease)
		.where(
			and(
				eq(lease.organizationId, orgId),
				eq(lease.status, 'active'),
				eq(lease.frequency, 'monthly'),
				lt(lease.startDate, next),
				sql`(${lease.endDate} is null or ${lease.endDate} >= ${periodStart})`
			)
		);
	if (!active.length) return;
	await db
		.insert(charge)
		.values(
			active.map((l) => ({
				organizationId: orgId,
				leaseId: l.id,
				kind: 'rent' as const,
				description: `Rent ${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
				periodStart,
				dueDate: `${month}-${String(l.rentDueDay).padStart(2, '0')}`,
				amount: l.rentAmount
			}))
		)
		.onConflictDoNothing();
}

export type RentRow = Awaited<ReturnType<typeof rentRoll>>[number];

/** Every charge due in `month` with what has been paid against it. */
export async function rentRoll(orgId: string, month: string) {
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
			paid: sql<number>`coalesce((select sum(${payment.amount}) from ${payment} where ${payment.chargeId} = ${charge.id}), 0)`.mapWith(
				Number
			),
			lastPaidOn: sql<
				string | null
			>`(select max(${payment.receivedOn}) from ${payment} where ${payment.chargeId} = ${charge.id})`,
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
