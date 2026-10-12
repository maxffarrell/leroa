import { assertPermission, assertRecordAccess } from '#lib/server/access.ts';
import type { OrgContext } from '#lib/server/context.ts';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	lease,
	maintenanceTicket,
	payment,
	property,
	unit,
	vendor
} from '#lib/server/db/schema.ts';
import { addDays, formatDate, monthKey, monthLabel, todayISO } from '#lib/format.ts';
import {
	REPORTS,
	type ReportColumn,
	type ReportKey,
	type ReportParams,
	type ReportResult,
	type ReportRow
} from '#lib/reports.ts';
import { balanceSql, outer, runRentAutomation, tenantNames } from './leasing.ts';

type ScopedReportParams = ReportParams & { propertyIds?: string[] };

type Built = Omit<ReportResult, 'key' | 'title' | 'subtitle' | 'totals'> & {
	note?: string;
	/** Totals that aren't a plain sum (rates, labels). */
	totalOverrides?: ReportRow;
};

const human = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replaceAll('_', ' ');

const inProperty = (orgId: string, propertyId?: string | null, propertyIds?: string[]) =>
	and(
		eq(property.organizationId, orgId),
		isNull(property.archivedAt),
		propertyId ? eq(property.id, propertyId) : undefined,
		propertyIds ? inArray(property.id, propertyIds) : undefined
	);

/** The lease in force on each unit today: skips renewals that haven't started and leases they replaced. */
const currentLease = and(
	eq(lease.status, 'active'),
	sql`not (${lease.renewedFromId} is not null and ${lease.startDate} > current_date)`,
	sql`not exists (select 1 from ${lease} r where r.renewed_from_id = ${outer(lease.id)} and r.status = 'active' and r.start_date <= current_date)`
);

async function orgCurrencies(orgId: string, propertyIds?: string[]) {
	const rows = await db
		.selectDistinct({ currency: lease.currency })
		.from(lease)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.where(
			and(
				eq(lease.organizationId, orgId),
				propertyIds ? inArray(unit.propertyId, propertyIds) : undefined
			)
		);
	return rows.map((r) => r.currency);
}

const single = (currencies: string[]) => (currencies.length <= 1 ? (currencies[0] ?? 'USD') : null);

async function unitRows(orgId: string, propertyId?: string | null, propertyIds?: string[]) {
	const [units, leases] = await Promise.all([
		db
			.select({
				unitId: unit.id,
				unitName: unit.name,
				bedrooms: unit.bedrooms,
				bathrooms: unit.bathrooms,
				areaSqft: unit.areaSqft,
				marketRent: unit.marketRent,
				status: unit.status,
				propertyId: property.id,
				propertyName: property.name
			})
			.from(unit)
			.innerJoin(property, eq(property.id, unit.propertyId))
			.where(inProperty(orgId, propertyId, propertyIds))
			.orderBy(asc(property.name), sql`length(${unit.name})`, asc(unit.name)),
		db
			.select({
				id: lease.id,
				unitId: lease.unitId,
				startDate: lease.startDate,
				endDate: lease.endDate,
				rentAmount: lease.rentAmount,
				depositAmount: lease.depositAmount,
				currency: lease.currency,
				tenants: tenantNames,
				balance: balanceSql
			})
			.from(lease)
			.where(and(eq(lease.organizationId, orgId), currentLease))
			.orderBy(desc(lease.startDate))
	]);
	const byUnit = new Map<string, (typeof leases)[number]>();
	for (const l of leases) if (!byUnit.has(l.unitId)) byUnit.set(l.unitId, l);
	return units.map((u) => ({ ...u, lease: byUnit.get(u.unitId) ?? null }));
}

async function rentRollReport(orgId: string, p: ScopedReportParams): Promise<Built> {
	await runRentAutomation(orgId);
	const units = await unitRows(orgId, p.propertyId, p.propertyIds);
	const currencies = [...new Set(units.flatMap((u) => (u.lease ? [u.lease.currency] : [])))];
	return {
		columns: [
			{ key: 'property', label: 'Property' },
			{ key: 'unit', label: 'Unit' },
			{ key: 'beds', label: 'Beds', type: 'number', secondary: true },
			{ key: 'baths', label: 'Baths', type: 'number', secondary: true },
			{ key: 'sqft', label: 'Sq ft', type: 'number', total: true, secondary: true },
			{ key: 'status', label: 'Status' },
			{ key: 'residents', label: 'Residents' },
			{ key: 'start', label: 'Lease start', type: 'date', secondary: true },
			{ key: 'end', label: 'Lease end', type: 'date', secondary: true },
			{ key: 'marketRent', label: 'Market rent', type: 'money', total: true, secondary: true },
			{ key: 'rent', label: 'Lease rent', type: 'money', total: true },
			{ key: 'deposit', label: 'Deposit', type: 'money', total: true, secondary: true },
			{ key: 'balance', label: 'Balance', type: 'money', total: true }
		],
		rows: units.map((u) => ({
			property: u.propertyName,
			unit: u.unitName,
			beds: u.bedrooms,
			baths: u.bathrooms,
			sqft: u.areaSqft,
			status: human(u.status),
			residents: u.lease?.tenants || null,
			start: u.lease?.startDate ?? null,
			end: u.lease?.endDate ?? null,
			marketRent: u.marketRent,
			rent: u.lease?.rentAmount ?? null,
			deposit: u.lease?.depositAmount ?? null,
			balance: u.lease ? Math.max(0, u.lease.balance) : null
		})),
		links: units.map((u) => (u.lease ? `/leases/${u.lease.id}` : `/properties/${u.propertyId}`)),
		currency: single(currencies.length ? currencies : await orgCurrencies(orgId, p.propertyIds))
	};
}

async function occupancyReport(orgId: string, p: ScopedReportParams): Promise<Built> {
	const units = await unitRows(orgId, p.propertyId, p.propertyIds);
	const groups = new Map<string, { id: string; name: string; units: typeof units }>();
	for (const u of units) {
		const g = groups.get(u.propertyId) ?? { id: u.propertyId, name: u.propertyName, units: [] };
		g.units.push(u);
		groups.set(u.propertyId, g);
	}
	const count = (us: typeof units, s: string) => us.filter((u) => u.status === s).length;
	const rate = (us: typeof units) =>
		us.length
			? Math.round(((count(us, 'occupied') + count(us, 'notice')) / us.length) * 1000) / 10
			: null;
	const list = [...groups.values()];
	return {
		columns: [
			{ key: 'property', label: 'Property' },
			{ key: 'units', label: 'Units', type: 'number', total: true },
			{ key: 'occupied', label: 'Occupied', type: 'number', total: true },
			{ key: 'notice', label: 'On notice', type: 'number', total: true, secondary: true },
			{ key: 'vacant', label: 'Vacant', type: 'number', total: true },
			{ key: 'offline', label: 'Offline', type: 'number', total: true, secondary: true },
			{ key: 'occupancy', label: 'Occupancy', type: 'percent' },
			{ key: 'rent', label: 'Scheduled rent', type: 'money', total: true, secondary: true },
			{ key: 'vacantRent', label: 'Vacant market rent', type: 'money', total: true }
		],
		rows: list.map((g) => ({
			property: g.name,
			units: g.units.length,
			occupied: count(g.units, 'occupied'),
			notice: count(g.units, 'notice'),
			vacant: count(g.units, 'vacant'),
			offline: count(g.units, 'offline'),
			occupancy: rate(g.units),
			rent: g.units.reduce((s, u) => s + (u.lease?.rentAmount ?? 0), 0),
			vacantRent: g.units
				.filter((u) => u.status === 'vacant')
				.reduce((s, u) => s + (u.marketRent ?? 0), 0)
		})),
		links: list.map((g) => `/properties/${g.id}`),
		totalOverrides: { occupancy: rate(units) },
		currency: single(await orgCurrencies(orgId, p.propertyIds)),
		note: 'Occupancy counts occupied and on-notice units. Vacant market rent uses each unit’s market rent.'
	};
}

const BUCKETS = [
	{ key: 'current', label: '0–30 days', max: 30 },
	{ key: 'd31', label: '31–60 days', max: 60 },
	{ key: 'd61', label: '61–90 days', max: 90 },
	{ key: 'd90', label: 'Over 90 days', max: Infinity }
] as const;

async function delinquencyReport(orgId: string, p: ScopedReportParams): Promise<Built> {
	await runRentAutomation(orgId);
	const today = todayISO();
	const charges = await db
		.select({
			leaseId: charge.leaseId,
			dueDate: charge.dueDate,
			amount: charge.amount,
			paid: sql<number>`coalesce((select sum(p.amount) from ${payment} p where p.charge_id = ${outer(charge.id)}), 0)`.mapWith(
				Number
			)
		})
		.from(charge)
		.innerJoin(lease, eq(lease.id, charge.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(inProperty(orgId, p.propertyId, p.propertyIds), lte(charge.dueDate, today)))
		.orderBy(asc(charge.dueDate));
	const leaseIds = [...new Set(charges.map((c) => c.leaseId))];
	if (!leaseIds.length)
		return {
			columns: delinquencyColumns(),
			rows: [],
			links: [],
			currency: single(await orgCurrencies(orgId, p.propertyIds))
		};

	const [unallocated, leases] = await Promise.all([
		db
			.select({
				leaseId: payment.leaseId,
				amount: sql<number>`sum(${payment.amount})`.mapWith(Number)
			})
			.from(payment)
			.where(and(inArray(payment.leaseId, leaseIds), isNull(payment.chargeId)))
			.groupBy(payment.leaseId),
		db
			.select({
				id: lease.id,
				status: lease.status,
				currency: lease.currency,
				tenants: tenantNames,
				unitName: unit.name,
				propertyName: property.name,
				lastPaid: sql<
					string | null
				>`(select max(${payment.receivedOn}) from ${payment} where ${payment.leaseId} = ${outer(lease.id)})`
			})
			.from(lease)
			.innerJoin(unit, eq(unit.id, lease.unitId))
			.innerJoin(property, eq(property.id, unit.propertyId))
			.where(inArray(lease.id, leaseIds))
	]);
	const credit = new Map(unallocated.map((u) => [u.leaseId, u.amount]));
	const aging = new Map<string, Record<(typeof BUCKETS)[number]['key'], number>>();
	for (const c of charges) {
		let open = c.amount - c.paid;
		if (open <= 0) continue;
		const left = credit.get(c.leaseId) ?? 0;
		const used = Math.min(left, open);
		credit.set(c.leaseId, left - used);
		open -= used;
		if (open <= 0) continue;
		const days = Math.round((Date.parse(today) - Date.parse(c.dueDate)) / 86400_000);
		const bucket = BUCKETS.find((b) => days <= b.max)!.key;
		const row = aging.get(c.leaseId) ?? { current: 0, d31: 0, d61: 0, d90: 0 };
		row[bucket] += open;
		aging.set(c.leaseId, row);
	}
	const owing = leases
		.flatMap((l) => {
			const a = aging.get(l.id);
			if (!a) return [];
			return [{ l, a, total: a.current + a.d31 + a.d61 + a.d90 }];
		})
		.sort((x, y) => y.total - x.total);
	return {
		columns: delinquencyColumns(),
		rows: owing.map(({ l, a, total }) => ({
			property: l.propertyName,
			unit: l.unitName,
			residents: l.tenants,
			lease: human(l.status),
			...a,
			total,
			lastPaid: l.lastPaid
		})),
		links: owing.map(({ l }) => `/leases/${l.id}`),
		currency: single([...new Set(owing.map((o) => o.l.currency))]),
		note: 'Payments not tied to a specific charge are applied to the oldest unpaid charges first.'
	};
}

function delinquencyColumns(): ReportColumn[] {
	return [
		{ key: 'property', label: 'Property' },
		{ key: 'unit', label: 'Unit' },
		{ key: 'residents', label: 'Residents' },
		{ key: 'lease', label: 'Lease', secondary: true },
		...BUCKETS.map((b) => ({
			key: b.key,
			label: b.label,
			type: 'money' as const,
			total: true,
			secondary: true
		})),
		{ key: 'total', label: 'Total owed', type: 'money', total: true },
		{ key: 'lastPaid', label: 'Last payment', type: 'date', secondary: true }
	];
}

async function expiringReport(orgId: string, p: ScopedReportParams): Promise<Built> {
	const today = todayISO();
	const days = p.days ?? 90;
	const rows = await db
		.select({
			id: lease.id,
			endDate: lease.endDate,
			rentAmount: lease.rentAmount,
			currency: lease.currency,
			tenants: tenantNames,
			unitName: unit.name,
			propertyName: property.name,
			marketRent: unit.marketRent,
			renewed: sql<boolean>`exists (select 1 from ${lease} r where r.renewed_from_id = ${outer(lease.id)} and r.status in ('draft', 'active'))`
		})
		.from(lease)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(
				inProperty(orgId, p.propertyId, p.propertyIds),
				eq(lease.status, 'active'),
				gte(lease.endDate, today),
				lte(lease.endDate, addDays(today, days))
			)
		)
		.orderBy(asc(lease.endDate), asc(property.name));
	return {
		columns: [
			{ key: 'property', label: 'Property' },
			{ key: 'unit', label: 'Unit' },
			{ key: 'residents', label: 'Residents' },
			{ key: 'end', label: 'Lease end', type: 'date' },
			{ key: 'daysLeft', label: 'Days left', type: 'number', secondary: true },
			{ key: 'rent', label: 'Rent', type: 'money', total: true, secondary: true },
			{ key: 'marketRent', label: 'Market rent', type: 'money', total: true, secondary: true },
			{ key: 'renewal', label: 'Renewal' }
		],
		rows: rows.map((r) => ({
			property: r.propertyName,
			unit: r.unitName,
			residents: r.tenants,
			end: r.endDate,
			daysLeft: Math.round((Date.parse(r.endDate!) - Date.parse(today)) / 86400_000),
			rent: r.rentAmount,
			marketRent: r.marketRent,
			renewal: r.renewed ? 'Renewed' : 'Not yet'
		})),
		links: rows.map((r) => `/leases/${r.id}`),
		currency: single([...new Set(rows.map((r) => r.currency))])
	};
}

async function collectionsReport(orgId: string, p: ScopedReportParams): Promise<Built> {
	await runRentAutomation(orgId);
	const months = p.months ?? 12;
	const current = monthKey();
	const [y, m] = current.split('-').map(Number) as [number, number];
	const first = monthKey(new Date(Date.UTC(y, m - months, 1)));
	const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
	const collected = sql`least(${charge.amount}, coalesce((select sum(p.amount) from ${payment} p where p.charge_id = ${charge.id}), 0))`;
	const rows = await db
		.select({
			month: sql<string>`to_char(${charge.dueDate}, 'YYYY-MM')`,
			currency: lease.currency,
			due: sql<number>`sum(${charge.amount})`.mapWith(Number),
			collected: sql<number>`sum(${collected})`.mapWith(Number),
			count: sql<number>`count(*)`.mapWith(Number),
			paidCount: sql<number>`count(*) filter (where ${collected} >= ${charge.amount})`.mapWith(
				Number
			)
		})
		.from(charge)
		.innerJoin(lease, eq(lease.id, charge.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(
				inProperty(orgId, p.propertyId, p.propertyIds),
				eq(charge.kind, 'rent'),
				gte(charge.dueDate, `${first}-01`),
				lte(charge.dueDate, end)
			)
		)
		.groupBy(sql`1`, lease.currency);
	const currencies = [...new Set(rows.map((r) => r.currency))];
	const list: (typeof rows)[number][] = [];
	for (let i = 0; i < months; i++) {
		const k = monthKey(new Date(Date.UTC(y, m - 1 - i, 1)));
		const found = rows.filter((r) => r.month === k);
		list.push(
			...(found.length
				? found
				: [
						{
							month: k,
							currency: currencies[0] ?? 'USD',
							due: 0,
							collected: 0,
							count: 0,
							paidCount: 0
						}
					])
		);
	}
	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
	const due = list.reduce((s, r) => s + r.due, 0);
	const got = list.reduce((s, r) => s + r.collected, 0);
	return {
		columns: [
			{ key: 'month', label: 'Month' },
			...(currencies.length > 1 ? [{ key: 'currency', label: 'Currency' }] : []),
			{ key: 'due', label: 'Rent due', type: 'money', total: true },
			{ key: 'collected', label: 'Collected', type: 'money', total: true },
			{ key: 'outstanding', label: 'Outstanding', type: 'money', total: true },
			{ key: 'rate', label: 'Collection rate', type: 'percent' },
			{ key: 'charges', label: 'Rent charges', type: 'number', total: true, secondary: true },
			{ key: 'paid', label: 'Paid in full', type: 'number', total: true, secondary: true }
		],
		rows: list.map((r) => ({
			month: monthLabel(r.month),
			currency: r.currency,
			due: r.due,
			collected: r.collected,
			outstanding: r.due - r.collected,
			rate: pct(r.collected, r.due),
			charges: r.count,
			paid: r.paidCount
		})),
		links: list.map(() => '/rent'),
		totalOverrides: { rate: currencies.length > 1 ? null : pct(got, due) },
		currency: single(currencies.length ? currencies : await orgCurrencies(orgId, p.propertyIds)),
		note: 'Collected counts payments applied to each month’s rent charge, capped at the charge amount.'
	};
}

async function maintenanceReport(orgId: string, p: ScopedReportParams): Promise<Built> {
	const to = p.to ?? todayISO();
	const from = p.from ?? `${to.slice(0, 4)}-01-01`;
	const rows = await db
		.select({
			id: maintenanceTicket.id,
			number: maintenanceTicket.number,
			title: maintenanceTicket.title,
			status: maintenanceTicket.status,
			priority: maintenanceTicket.priority,
			createdAt: maintenanceTicket.createdAt,
			closedAt: maintenanceTicket.closedAt,
			cost: maintenanceTicket.costAmount,
			propertyName: property.name,
			unitName: unit.name,
			vendorName: vendor.name
		})
		.from(maintenanceTicket)
		.innerJoin(property, eq(property.id, maintenanceTicket.propertyId))
		.leftJoin(unit, eq(unit.id, maintenanceTicket.unitId))
		.leftJoin(vendor, eq(vendor.id, maintenanceTicket.vendorId))
		.where(
			and(
				inProperty(orgId, p.propertyId, p.propertyIds),
				eq(maintenanceTicket.organizationId, orgId),
				sql`${maintenanceTicket.createdAt}::date between ${from}::date and ${to}::date`
			)
		)
		.orderBy(desc(maintenanceTicket.createdAt));
	const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
	return {
		columns: [
			{ key: 'number', label: '#', type: 'number' },
			{ key: 'title', label: 'Request' },
			{ key: 'property', label: 'Property', secondary: true },
			{ key: 'unit', label: 'Unit', secondary: true },
			{ key: 'priority', label: 'Priority', secondary: true },
			{ key: 'status', label: 'Status' },
			{ key: 'vendor', label: 'Vendor', secondary: true },
			{ key: 'opened', label: 'Opened', type: 'date', secondary: true },
			{ key: 'closed', label: 'Closed', type: 'date', secondary: true },
			{ key: 'days', label: 'Days to close', type: 'number', secondary: true },
			{ key: 'cost', label: 'Cost', type: 'money', total: true }
		],
		rows: rows.map((r) => ({
			number: r.number,
			title: r.title,
			property: r.propertyName,
			unit: r.unitName,
			priority: human(r.priority),
			status: human(r.status),
			vendor: r.vendorName,
			opened: iso(r.createdAt),
			closed: iso(r.closedAt),
			days: r.closedAt
				? Math.max(0, Math.round((r.closedAt.getTime() - r.createdAt.getTime()) / 86400_000))
				: null,
			cost: r.cost
		})),
		links: rows.map((r) => `/maintenance?ticket=${r.id}`),
		totalOverrides: { number: null },
		currency: single(await orgCurrencies(orgId, p.propertyIds)),
		note: `Requests opened ${formatDate(from)} – ${formatDate(to)}. Cost is what staff or the vendor recorded on the job.`
	};
}

const builders: Record<ReportKey, (orgId: string, p: ScopedReportParams) => Promise<Built>> = {
	'rent-roll': rentRollReport,
	occupancy: occupancyReport,
	delinquency: delinquencyReport,
	'expiring-leases': expiringReport,
	collections: collectionsReport,
	maintenance: maintenanceReport
};

function totalsRow(b: Built): ReportRow | null {
	if (!b.rows.length) return null;
	const totals: ReportRow = {};
	for (const c of b.columns) {
		if (!c.total || (c.type === 'money' && b.currency === null)) totals[c.key] = null;
		else
			totals[c.key] = b.rows.reduce(
				(s, r) => s + (typeof r[c.key] === 'number' ? (r[c.key] as number) : 0),
				0
			);
	}
	Object.assign(totals, b.totalOverrides);
	totals[b.columns[0]!.key] = `Total (${b.rows.length})`;
	return totals;
}

export async function runReport(
	orgId: string,
	key: ReportKey,
	params: ReportParams,
	ctx?: OrgContext
): Promise<ReportResult & { note?: string; propertyName: string | null }> {
	if (ctx) {
		assertPermission(ctx, 'reports');
		if (params.propertyId) await assertRecordAccess(ctx, 'properties', params.propertyId);
	}
	const scoped: ScopedReportParams = { ...params, propertyIds: ctx?.propertyIds ?? undefined };
	const [built, prop] = await Promise.all([
		builders[key](orgId, scoped),
		params.propertyId
			? db.query.property.findFirst({
					columns: { name: true },
					where: (t, { and, eq }) => and(eq(t.organizationId, orgId), eq(t.id, params.propertyId!))
				})
			: undefined
	]);
	const { totalOverrides: _, ...rest } = built;
	const scope = prop?.name ?? 'All properties';
	return {
		...rest,
		key,
		title: REPORTS[key].title,
		subtitle: `${scope} · as of ${formatDate(todayISO())}`,
		totals: totalsRow(built),
		propertyName: prop?.name ?? null
	};
}
