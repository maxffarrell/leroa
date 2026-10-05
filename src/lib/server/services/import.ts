import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import { charge, lease, leaseTenant, property, tenant, unit } from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type { importInput } from '#lib/schemas.ts';
import { parseCsv } from '#lib/csv.ts';
import {
	IMPORT_TYPES,
	parseDate,
	parseMoney,
	parseNumber,
	splitName,
	splitResidents,
	type ImportKind,
	type PersonName
} from '#lib/import.ts';
import { monthKey, todayISO } from '#lib/format.ts';
import { ensureRentCharges } from './leasing.ts';
import { emit } from './events.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_IMPORT_ROWS = 2000;

export type ImportRowStatus = 'create' | 'update' | 'skip' | 'error';
export type ImportRowResult = { line: number; status: ImportRowStatus; message: string };
export type ImportResult = {
	applied: boolean;
	rows: ImportRowResult[];
	counts: Record<ImportRowStatus, number>;
};

class RowError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const key = (...parts: string[]) => parts.map((p) => p.trim().toLowerCase()).join('\u0000');

function wrap<T>(label: string, fn: () => T): T {
	try {
		return fn();
	} catch (e) {
		throw new RowError(`${label}: ${(e as Error).message}`);
	}
}

/**
 * Validates every row, matching existing records by name/email, then (unless `dryRun`) writes
 * the valid rows in one transaction. Rows with problems are reported and skipped.
 */
export async function runImport(
	ctx: OrgContext,
	input: Out<typeof importInput>
): Promise<ImportResult> {
	const table = parseCsv(input.csv);
	if (table.length < 2) error(400, 'The file needs a header row and at least one data row');
	const body = table.slice(1);
	if (body.length > MAX_IMPORT_ROWS)
		error(400, `Import up to ${MAX_IMPORT_ROWS.toLocaleString('en-US')} rows at a time`);

	const spec = IMPORT_TYPES[input.kind];
	for (const field of spec.fields)
		if (field.required && input.mapping[field.key] == null)
			error(400, `Choose the column for ${field.label}`);
	const hasName = ['name', 'firstName', 'lastName', 'company'].some(
		(k) => input.mapping[k] != null
	);
	if (input.kind !== 'units' && !hasName) error(400, 'Choose a column for the tenant’s name');

	const run = async (tx: Tx | null) => {
		const state = await loadState(ctx.orgId);
		const ids = { n: 0 };
		const results: ImportRowResult[] = [];
		for (const [i, raw] of body.entries()) {
			const get = (k: string) => {
				const col = input.mapping[k];
				return col == null ? '' : (raw[col] ?? '').trim();
			};
			try {
				const message = await processRow(input.kind, get, { ctx, tx, state, ids });
				results.push({ line: i + 2, ...message });
			} catch (e) {
				if (!(e instanceof RowError)) throw e;
				results.push({ line: i + 2, status: 'error', message: e.message });
			}
		}
		return results;
	};

	const rows = input.dryRun ? await run(null) : await db.transaction((tx) => run(tx));
	const counts = { create: 0, update: 0, skip: 0, error: 0 };
	for (const r of rows) counts[r.status]++;

	if (!input.dryRun && counts.create + counts.update > 0) {
		if (input.kind === 'leases') await ensureRentCharges(ctx.orgId, monthKey());
		await emit({
			orgId: ctx.orgId,
			actorId: ctx.userId,
			entityType: 'import',
			entityId: randomUUID(),
			action: 'completed',
			summary: `Imported ${spec.title.toLowerCase()} from CSV: ${counts.create} added, ${counts.update} updated`,
			data: { kind: input.kind, ...counts }
		});
	}
	return { applied: !input.dryRun, rows, counts };
}

type State = Awaited<ReturnType<typeof loadState>>;
type Ctx = { ctx: OrgContext; tx: Tx | null; state: State; ids: { n: number } };

async function loadState(orgId: string) {
	const [properties, units, tenants, leases] = await Promise.all([
		db
			.select({ id: property.id, name: property.name })
			.from(property)
			.where(and(eq(property.organizationId, orgId), isNull(property.archivedAt))),
		db
			.select({ id: unit.id, propertyId: unit.propertyId, name: unit.name })
			.from(unit)
			.where(eq(unit.organizationId, orgId)),
		db
			.select({
				id: tenant.id,
				email: tenant.email,
				firstName: tenant.firstName,
				lastName: tenant.lastName,
				companyName: tenant.companyName
			})
			.from(tenant)
			.where(eq(tenant.organizationId, orgId)),
		db
			.select({ unitId: lease.unitId, startDate: lease.startDate, status: lease.status })
			.from(lease)
			.where(eq(lease.organizationId, orgId))
	]);
	const byEmail = new Map<string, string>();
	const byName = new Map<string, string>();
	for (const t of tenants) {
		if (t.email) byEmail.set(key(t.email), t.id);
		byName.set(key(`${t.firstName} ${t.lastName}`.trim() || t.companyName || ''), t.id);
	}
	const unitLeases = new Map<string, { startDate: string; status: string }[]>();
	for (const l of leases) unitLeases.set(l.unitId, [...(unitLeases.get(l.unitId) ?? []), l]);
	return {
		properties: new Map(properties.map((p) => [key(p.name), p.id])),
		units: new Map(units.map((u) => [key(u.propertyId, u.name), u.id])),
		byEmail,
		byName,
		unitLeases
	};
}

const fakeId = (c: Ctx) => `new-${++c.ids.n}`;

async function findOrCreateProperty(c: Ctx, name: string, get: (k: string) => string) {
	const existing = c.state.properties.get(key(name));
	if (existing) return { id: existing, created: false };
	const country = (get('country') || 'US').toUpperCase();
	if (!/^[A-Z]{2}$/.test(country)) throw new RowError('Country: use a 2-letter code like US');
	let id = fakeId(c);
	if (c.tx) {
		const [p] = await c.tx
			.insert(property)
			.values({
				organizationId: c.ctx.orgId,
				name,
				addressLine1: get('address'),
				city: get('city'),
				region: get('region'),
				postalCode: get('postalCode'),
				country
			})
			.returning({ id: property.id });
		id = p!.id;
	}
	c.state.properties.set(key(name), id);
	return { id, created: true };
}

async function findOrCreateUnit(c: Ctx, propertyId: string, name: string) {
	const existing = c.state.units.get(key(propertyId, name));
	if (existing) return { id: existing, created: false };
	let id = fakeId(c);
	if (c.tx) {
		const [u] = await c.tx
			.insert(unit)
			.values({ organizationId: c.ctx.orgId, propertyId, name })
			.returning({ id: unit.id });
		id = u!.id;
	}
	c.state.units.set(key(propertyId, name), id);
	return { id, created: true };
}

async function findOrCreateTenant(
	c: Ctx,
	person: PersonName & { company?: string; email?: string; phone?: string; notes?: string }
) {
	const fullName = `${person.firstName} ${person.lastName}`.trim() || person.company || '';
	const existing =
		(person.email && c.state.byEmail.get(key(person.email))) ||
		(!person.email ? c.state.byName.get(key(fullName)) : undefined);
	if (existing) return { id: existing, created: false, name: fullName };
	let id = fakeId(c);
	if (c.tx) {
		const [t] = await c.tx
			.insert(tenant)
			.values({
				organizationId: c.ctx.orgId,
				kind: !person.firstName && !person.lastName && person.company ? 'company' : 'person',
				firstName: person.firstName,
				lastName: person.lastName,
				companyName: person.company || null,
				email: person.email || null,
				phone: person.phone || null,
				notes: person.notes || null
			})
			.returning({ id: tenant.id });
		id = t!.id;
	}
	if (person.email) c.state.byEmail.set(key(person.email), id);
	c.state.byName.set(key(fullName), id);
	return { id, created: true, name: fullName };
}

function contact(get: (k: string) => string) {
	const email = get('email');
	if (email && !EMAIL.test(email)) throw new RowError(`Email: “${email}” isn't an email address`);
	return { email, phone: get('phone') };
}

function people(get: (k: string) => string): PersonName[] {
	if (get('firstName') || get('lastName'))
		return [{ firstName: get('firstName'), lastName: get('lastName') }];
	return get('name') ? splitResidents(get('name')) : [];
}

async function processRow(
	kind: ImportKind,
	get: (k: string) => string,
	c: Ctx
): Promise<{ status: ImportRowStatus; message: string }> {
	if (kind === 'tenants') {
		const person =
			get('firstName') || get('lastName')
				? { firstName: get('firstName'), lastName: get('lastName') }
				: get('name')
					? splitName(get('name'))
					: { firstName: '', lastName: '' };
		const company = get('company');
		if (!person.firstName && !person.lastName && !company) throw new RowError('Name is empty');
		const t = await findOrCreateTenant(c, {
			...person,
			company,
			...contact(get),
			notes: get('notes')
		});
		return t.created
			? { status: 'create', message: `New tenant ${t.name}` }
			: { status: 'skip', message: `${t.name} is already a tenant` };
	}

	const propertyName = get('property');
	const unitName = get('unit');
	if (!propertyName) throw new RowError('Property is empty');
	if (!unitName) throw new RowError('Unit is empty');

	if (kind === 'units') {
		const values = {
			bedrooms: wrap('Bedrooms', () => parseNumber(get('bedrooms'))),
			bathrooms: wrap('Bathrooms', () => parseNumber(get('bathrooms'))),
			areaSqft: wrap('Square feet', () => parseNumber(get('sqft'))),
			marketRent: wrap('Market rent', () => parseMoney(get('marketRent')))
		};
		if (values.bedrooms != null && !Number.isInteger(values.bedrooms))
			throw new RowError('Bedrooms: use a whole number');
		if (values.marketRent != null && values.marketRent < 0)
			throw new RowError('Market rent: can’t be negative');
		const p = await findOrCreateProperty(c, propertyName, get);
		const u = await findOrCreateUnit(c, p.id, unitName);
		const set = Object.fromEntries(
			Object.entries({
				...values,
				areaSqft: values.areaSqft && Math.round(values.areaSqft)
			}).filter(([, x]) => x != null)
		);
		if (c.tx && Object.keys(set).length) await c.tx.update(unit).set(set).where(eq(unit.id, u.id));
		if (u.created)
			return {
				status: 'create',
				message: p.created
					? `New property ${propertyName}, unit ${unitName}`
					: `New unit ${unitName}`
			};
		return Object.keys(set).length
			? { status: 'update', message: `Updates unit ${unitName}` }
			: { status: 'skip', message: `Unit ${unitName} already exists` };
	}

	const residents = people(get);
	if (!residents.length || residents.some((r) => !r.firstName && !r.lastName))
		throw new RowError('Resident name is empty');
	const startDate = wrap('Lease start', () => parseDate(get('startDate')));
	if (!startDate) throw new RowError('Lease start is empty');
	const endDate = wrap('Lease end', () => parseDate(get('endDate')));
	if (endDate && endDate < startDate) throw new RowError('Lease end is before the start');
	const rent = wrap('Rent', () => parseMoney(get('rent')));
	if (rent == null || rent < 0) throw new RowError('Rent is empty');
	const deposit = wrap('Deposit', () => parseMoney(get('deposit'))) ?? 0;
	if (deposit < 0) throw new RowError('Deposit: can’t be negative');
	const balance = wrap('Balance', () => parseMoney(get('balance'))) ?? 0;
	if (balance < 0) throw new RowError('Balance: credits aren’t supported, use 0');
	const dueDay = wrap('Due day', () => parseNumber(get('dueDay'))) ?? 1;
	if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)
		throw new RowError('Due day: use a day from 1 to 28');
	const { email, phone } = contact(get);
	const status = endDate && endDate < todayISO() ? ('ended' as const) : ('active' as const);

	const p = await findOrCreateProperty(c, propertyName, get);
	const u = await findOrCreateUnit(c, p.id, unitName);
	const existing = c.state.unitLeases.get(u.id) ?? [];
	if (existing.some((l) => l.startDate === startDate))
		return {
			status: 'skip',
			message: `Unit ${unitName} already has a lease starting ${startDate}`
		};
	const clash = existing.find((l) => l.status === 'active');
	if (status === 'active' && clash)
		throw new RowError(`Unit ${unitName} already has an active lease (from ${clash.startDate})`);

	const tenantIds: string[] = [];
	const names: string[] = [];
	for (const [i, r] of residents.entries()) {
		const t = await findOrCreateTenant(c, i === 0 ? { ...r, email, phone } : r);
		tenantIds.push(t.id);
		names.push(t.name);
	}
	if (c.tx) {
		const [l] = await c.tx
			.insert(lease)
			.values({
				organizationId: c.ctx.orgId,
				unitId: u.id,
				status,
				startDate,
				endDate,
				rentAmount: rent,
				depositAmount: deposit,
				rentDueDay: dueDay,
				notes: 'Imported from CSV'
			})
			.returning({ id: lease.id });
		await c.tx.insert(leaseTenant).values(
			[...new Set(tenantIds)].map((tenantId, i) => ({
				leaseId: l!.id,
				tenantId,
				isPrimary: i === 0
			}))
		);
		if (status === 'active')
			await c.tx.update(unit).set({ status: 'occupied' }).where(eq(unit.id, u.id));
		if (balance > 0)
			await c.tx.insert(charge).values({
				organizationId: c.ctx.orgId,
				leaseId: l!.id,
				kind: 'other',
				description: 'Opening balance (imported)',
				dueDate: todayISO(),
				amount: balance
			});
	}
	c.state.unitLeases.set(u.id, [...existing, { startDate, status }]);
	return {
		status: 'create',
		message: `${status === 'ended' ? 'Past lease' : 'Lease'} for ${names.join(' & ')} in ${propertyName} ${unitName}`
	};
}
