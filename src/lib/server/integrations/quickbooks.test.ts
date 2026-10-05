import { describe, expect, it } from 'vitest';
import type { SyncCharge, SyncContext, SyncPayment, SyncTenant } from '@leroa/integration-sdk';
import quickbooks, {
	apiBase,
	displayName,
	quote
} from '../../../../integrations/quickbooks/index.ts';

type Call = { method: string; url: URL; body: Record<string, unknown> | null };

/** A fake QuickBooks company: answers queries from `existing` and assigns IDs to creates. */
function fakeQbo(
	existing: Record<string, Record<string, unknown>[]> = {},
	opts: { status?: number; home?: string } = {}
) {
	const calls: Call[] = [];
	let next = 100;
	const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input));
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
		calls.push({ method: init?.method ?? 'GET', url, body });
		if (opts.status) return Response.json({}, { status: opts.status });
		const path = url.pathname.split('/').slice(4).join('/');
		if (path === 'preferences')
			return Response.json({
				Preferences: { CurrencyPrefs: { HomeCurrency: { value: opts.home ?? 'USD' } } }
			});
		if (path === 'query') {
			const q = url.searchParams.get('query')!;
			const entity = q.match(/from (\w+)/)![1]!;
			const name = q
				.match(/\b(?:Display)?Name = '((?:[^'\\]|\\.)*)'/)?.[1]
				?.replace(/\\(.)/g, '$1');
			const rows = (existing[entity] ?? []).filter(
				(r) => !name || r.Name === name || r.DisplayName === name
			);
			return Response.json({ QueryResponse: rows.length ? { [entity]: rows } : {} });
		}
		const entity = path.charAt(0).toUpperCase() + path.slice(1);
		return Response.json({ [entity]: { Id: String(next++), ...body } });
	}) as typeof fetch;
	return { calls, fetcher };
}

function ctx(
	fetcher: typeof fetch,
	config: Partial<{ includeDeposits: boolean; incomeAccount: string }> = {},
	links: Record<string, string> = {}
) {
	return {
		config: { syncFrom: '2026-01-01', includeDeposits: false, incomeAccount: '', ...config },
		workspace: { id: 'org', name: 'Org' },
		fetch: fetcher,
		log: () => {},
		connection: { accessToken: 'tok', params: { realmId: '9130', environment: 'sandbox' } },
		externalId: (type: string, id: string) => links[`${type}:${id}`],
		cache: new Map()
	} as SyncContext<{ syncFrom: string; includeDeposits: boolean; incomeAccount: string }>;
}

const jane: SyncTenant = {
	id: 't1',
	name: 'Jane Doe',
	firstName: 'Jane',
	lastName: 'Doe',
	companyName: null,
	email: 'jane@example.com',
	phone: '555-0100'
};
const rent: SyncCharge = {
	id: 'c1',
	leaseId: 'l1',
	tenantId: 't1',
	kind: 'rent',
	description: 'Rent for March',
	periodStart: '2026-03-01',
	dueDate: '2026-03-01',
	amount: 145000,
	currency: 'USD',
	property: 'Maple Court',
	unit: '2B'
};
const paid: SyncPayment = {
	id: 'p1',
	leaseId: 'l1',
	tenantId: 't1',
	chargeId: 'c1',
	chargeKind: 'rent',
	chargeDueDate: '2026-03-01',
	amount: 145000,
	currency: 'USD',
	receivedOn: '2026-03-03',
	method: 'ach',
	reference: 'ACH-0001-LONG-REFERENCE-NUMBER'
};
const push = quickbooks.sync!.push;

describe('quickbooks helpers', () => {
	it('picks the API host', () => {
		expect(apiBase({ environment: 'sandbox' })).toBe('https://sandbox-quickbooks.api.intuit.com');
		expect(apiBase({ environment: 'production' })).toBe('https://quickbooks.api.intuit.com');
		expect(apiBase({ apiBase: 'http://localhost:9999/' })).toBe('http://localhost:9999');
	});
	it('escapes query literals and display names', () => {
		expect(quote("O'Brien \\ Co")).toBe("'O\\'Brien \\\\ Co'");
		expect(displayName({ name: 'Acme: Unit\t4', email: null })).toBe('Acme Unit 4');
		expect(displayName({ name: ' ', email: 'x@y.z' })).toBe('x@y.z');
	});
	it('rejects a malformed start date', () => {
		const cfg = { syncFrom: '2026-13-45', includeDeposits: false, incomeAccount: '' };
		expect(quickbooks.validate!(cfg)).toMatch(/date/);
		expect(quickbooks.validate!({ ...cfg, syncFrom: '2026-01-01' })).toBeNull();
		expect(quickbooks.validate!({ ...cfg, syncFrom: '' })).toBeNull();
	});
});

describe('quickbooks push', () => {
	it('creates a customer, with the minor version and bearer token', async () => {
		const q = fakeQbo();
		expect(await push('tenant', jane, ctx(q.fetcher))).toEqual({ externalId: '100' });
		const create = q.calls.at(-1)!;
		expect(create.url.pathname).toBe('/v3/company/9130/customer');
		expect(create.url.searchParams.get('minorversion')).toBe('75');
		expect(create.body).toMatchObject({
			DisplayName: 'Jane Doe',
			GivenName: 'Jane',
			PrimaryEmailAddr: { Address: 'jane@example.com' }
		});
	});
	it('reuses a matching customer but not a namesake with another email', async () => {
		const same = fakeQbo({
			Customer: [
				{ Id: '7', DisplayName: 'Jane Doe', PrimaryEmailAddr: { Address: 'JANE@example.com' } }
			]
		});
		expect(await push('tenant', jane, ctx(same.fetcher))).toEqual({ externalId: '7' });
		expect(same.calls.every((c) => c.method === 'GET')).toBe(true);

		const other = fakeQbo({
			Customer: [
				{ Id: '8', DisplayName: 'Jane Doe', PrimaryEmailAddr: { Address: 'other@example.com' } }
			]
		});
		await push('tenant', jane, ctx(other.fetcher));
		expect(other.calls.at(-1)!.body).toMatchObject({ DisplayName: 'Jane Doe (jane@example.com)' });
	});
	it('invoices a charge, creating the item under a rent income account once', async () => {
		const q = fakeQbo({
			Account: [
				{ Id: '1', Name: 'Sales' },
				{ Id: '2', Name: 'Rental Income' }
			]
		});
		const c = ctx(q.fetcher, {}, { 'tenant:t1': '100' });
		await push('charge', rent, c);
		await push('charge', { ...rent, id: 'c2' }, c);
		const items = q.calls.filter((x) => x.url.pathname.endsWith('/item'));
		expect(items).toHaveLength(1);
		expect(items[0]!.body).toMatchObject({
			Name: 'Rent',
			Type: 'Service',
			IncomeAccountRef: { value: '2' }
		});
		const invoice = q.calls.at(-1)!;
		expect(invoice.body).toMatchObject({
			CustomerRef: { value: '100' },
			DueDate: '2026-03-01',
			Line: [
				{
					Amount: 1450,
					SalesItemLineDetail: { Qty: 1, UnitPrice: 1450, ServiceDate: '2026-03-01' }
				}
			]
		});
	});
	it('skips deposits, other currencies and records with missing customers', async () => {
		const q = fakeQbo({}, { home: 'USD' });
		const c = ctx(q.fetcher, {}, { 'tenant:t1': '100' });
		expect(await push('charge', { ...rent, kind: 'deposit' }, c)).toHaveProperty('skip');
		expect(await push('charge', { ...rent, currency: 'EUR' }, c)).toHaveProperty('skip');
		expect(await push('payment', { ...paid, chargeKind: 'deposit' }, c)).toHaveProperty('skip');
		await expect(push('charge', { ...rent, tenantId: 't9' }, c)).rejects.toThrow(/tenant/);
		await expect(push('payment', paid, c)).rejects.toThrow(/charge/);
	});
	it('applies a payment to its invoice, or keeps it as credit', async () => {
		const q = fakeQbo();
		const c = ctx(q.fetcher, {}, { 'tenant:t1': '100', 'charge:c1': '200' });
		await push('payment', paid, c);
		expect(q.calls.at(-1)!.body).toMatchObject({
			TotalAmt: 1450,
			TxnDate: '2026-03-03',
			PaymentRefNum: 'ACH-0001-LONG-REFEREN',
			Line: [{ Amount: 1450, LinkedTxn: [{ TxnId: '200', TxnType: 'Invoice' }] }]
		});
		await push('payment', { ...paid, id: 'p2', chargeId: null, chargeKind: null }, c);
		expect(q.calls.at(-1)!.body).toMatchObject({ Line: [] });
	});
	it('stops the run when QuickBooks refuses the token or rate-limits', async () => {
		for (const status of [401, 429]) {
			const q = fakeQbo({}, { status });
			await expect(push('tenant', jane, ctx(q.fetcher))).rejects.toMatchObject({
				name: 'SyncFatalError'
			});
		}
	});
});
