import { describe, expect, it } from 'vitest';
import type { SyncCharge, SyncContext, SyncPayment, SyncTenant } from '@leroa/integration-sdk';
import { SyncFatalError } from '@leroa/integration-sdk';
import xero, {
	authEventId,
	contactName,
	idempotencyKey,
	pickBankAccount,
	pickOrganisation,
	pickRevenueAccount,
	problemMessage
} from '../../../../integrations/xero/index.ts';

type Config = {
	syncFrom: string;
	includeDeposits: boolean;
	revenueAccount: string;
	bankAccount: string;
};
type Call = {
	method: string;
	url: URL;
	headers: Record<string, string>;
	body: Record<string, unknown[]> | null;
};

const ACCOUNTS = [
	{ AccountID: 'a-sales', Code: '200', Name: 'Sales', Type: 'REVENUE', Class: 'REVENUE' },
	{ AccountID: 'a-rent', Code: '210', Name: 'Rental Income', Type: 'REVENUE', Class: 'REVENUE' },
	{ AccountID: 'a-bank', Code: '090', Name: 'Business Bank Account', Type: 'BANK', Class: 'ASSET' },
	{
		AccountID: 'a-old',
		Code: '091',
		Name: 'Old Bank',
		Type: 'BANK',
		Class: 'ASSET',
		Status: 'ARCHIVED'
	}
];

/** A fake Xero organisation: searches `contacts` and assigns IDs to creates. */
function fakeXero(
	opts: { contacts?: Record<string, unknown>[]; status?: number; currency?: string } = {}
) {
	const calls: Call[] = [];
	let next = 100;
	const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input));
		const body = init?.body ? JSON.parse(String(init.body)) : null;
		calls.push({
			method: init?.method ?? 'GET',
			url,
			headers: (init?.headers ?? {}) as Record<string, string>,
			body
		});
		if (opts.status) return Response.json({}, { status: opts.status });
		const path = url.pathname.replace('/api.xro/2.0/', '');
		if (path === 'Organisation')
			return Response.json({ Organisations: [{ BaseCurrency: opts.currency ?? 'USD' }] });
		if (path === 'Accounts') return Response.json({ Accounts: ACCOUNTS });
		if (path === 'Contacts' && !body) {
			const term = url.searchParams.get('searchTerm')!.toLowerCase();
			return Response.json({
				Contacts: (opts.contacts ?? []).filter((c) => String(c.Name).toLowerCase().includes(term))
			});
		}
		if (path.includes('/'))
			return Response.json({ Payments: [{ PaymentID: path.split('/')[1], ...body }] });
		const idKey = { Contacts: 'ContactID', Invoices: 'InvoiceID', Payments: 'PaymentID' }[
			path.split('/')[0]!
		]!;
		const list = body[path.split('/')[0]!] as Record<string, unknown>[];
		return Response.json({
			[path.split('/')[0]!]: list.map((r) => ({ [idKey]: `x${next++}`, ...r }))
		});
	}) as typeof fetch;
	return { calls, fetcher };
}

function ctx(
	fetcher: typeof fetch,
	config: Partial<Config> = {},
	links: Record<string, string> = {}
) {
	return {
		config: {
			syncFrom: '2026-01-01',
			includeDeposits: false,
			revenueAccount: '',
			bankAccount: '',
			...config
		},
		workspace: { id: 'org', name: 'Org' },
		fetch: fetcher,
		log: () => {},
		connection: { accessToken: 'tok', params: { tenantId: 'tenant-1' } },
		externalId: (type: string, id: string) => links[`${type}:${id}`],
		cache: new Map()
	} as SyncContext<Config>;
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
	receivedOn: '2026-03-02',
	method: 'ach',
	reference: 'CHK 1001'
};

const push = xero.sync!.push;

describe('xero contacts', () => {
	it('creates a contact with the tenant id header and an idempotency key', async () => {
		const { calls, fetcher } = fakeXero();
		expect(await push('tenant', jane, ctx(fetcher))).toEqual({ externalId: 'x100' });
		const create = calls.at(-1)!;
		expect(create.method).toBe('PUT');
		expect(create.headers['xero-tenant-id']).toBe('tenant-1');
		expect(create.headers['idempotency-key']).toBe(idempotencyKey('Contacts', create.body));
		expect(create.body!.Contacts![0]).toEqual({
			Name: 'Jane Doe',
			FirstName: 'Jane',
			LastName: 'Doe',
			EmailAddress: 'jane@example.com',
			Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: '555-0100' }]
		});
	});

	it('reuses a matching contact and avoids clashing with a different person', async () => {
		const same = fakeXero({
			contacts: [{ ContactID: 'c-9', Name: 'jane doe', EmailAddress: 'JANE@example.com' }]
		});
		expect(await push('tenant', jane, ctx(same.fetcher))).toEqual({ externalId: 'c-9' });
		expect(same.calls).toHaveLength(1);

		const other = fakeXero({
			contacts: [{ ContactID: 'c-9', Name: 'Jane Doe', EmailAddress: 'other@example.com' }]
		});
		await push('tenant', jane, ctx(other.fetcher));
		expect(other.calls.at(-1)!.body!.Contacts![0]).toMatchObject({
			Name: 'Jane Doe (jane@example.com)'
		});
	});

	it('normalises contact names', () => {
		expect(contactName({ name: '  Ann \n Lee ', email: null })).toBe('Ann Lee');
		expect(contactName({ name: '', email: 'a@b.co' })).toBe('a@b.co');
	});
});

describe('xero invoices', () => {
	it('posts an authorised tax-inclusive sales invoice to the rent revenue account', async () => {
		const { calls, fetcher } = fakeXero();
		const r = await push('charge', rent, ctx(fetcher, {}, { 'tenant:t1': 'c-1' }));
		expect(r).toEqual({ externalId: 'x100' });
		expect(calls.at(-1)!.body!.Invoices![0]).toEqual({
			Type: 'ACCREC',
			Contact: { ContactID: 'c-1' },
			Date: '2026-03-01',
			DueDate: '2026-03-01',
			Reference: 'Maple Court · 2B',
			CurrencyCode: 'USD',
			LineAmountTypes: 'Inclusive',
			Status: 'AUTHORISED',
			LineItems: [
				{ Description: 'Rent for March', Quantity: 1, UnitAmount: 1450, AccountCode: '210' }
			]
		});
	});

	it('skips deposits, empty charges and foreign currencies', async () => {
		const { fetcher } = fakeXero({ currency: 'NZD' });
		const c = ctx(fetcher, {}, { 'tenant:t1': 'c-1' });
		expect(await push('charge', { ...rent, kind: 'deposit' }, c)).toHaveProperty('skip');
		expect(await push('charge', { ...rent, amount: 0 }, c)).toHaveProperty('skip');
		expect(await push('charge', rent, c)).toEqual({
			skip: 'Charged in USD, but the Xero organisation uses NZD'
		});
	});
});

describe('xero payments', () => {
	it('applies the payment to its invoice from the default bank account', async () => {
		const { calls, fetcher } = fakeXero();
		const links = { 'tenant:t1': 'c-1', 'charge:c1': 'inv-1' };
		expect(await push('payment', paid, ctx(fetcher, {}, links))).toEqual({ externalId: 'x100' });
		expect(calls.at(-1)!.body!.Payments![0]).toEqual({
			Invoice: { InvoiceID: 'inv-1' },
			Account: { AccountID: 'a-bank' },
			Date: '2026-03-02',
			Amount: 1450,
			Reference: 'CHK 1001 · Leroa ach'
		});
	});

	it('skips unapplied credit and waits for the invoice', async () => {
		const { fetcher } = fakeXero();
		const c = ctx(fetcher, {}, { 'tenant:t1': 'c-1' });
		expect(await push('payment', { ...paid, chargeId: null }, c)).toHaveProperty('skip');
		await expect(push('payment', paid, c)).rejects.toThrow('not in Xero yet');
	});

	it('deletes a payment and tolerates one already deleted', async () => {
		const { calls, fetcher } = fakeXero();
		await xero.sync!.remove!('payment', 'pay-1', ctx(fetcher));
		expect(calls[0]!.method).toBe('POST');
		expect(calls[0]!.url.pathname).toBe('/api.xro/2.0/Payments/pay-1');
		expect(calls[0]!.body).toEqual({ Status: 'DELETED' });
		const gone = fakeXero({ status: 404 });
		await expect(
			xero.sync!.remove!('payment', 'pay-1', ctx(gone.fetcher))
		).resolves.toBeUndefined();
	});

	it('stops the run when Xero refuses the token or rate-limits', async () => {
		for (const status of [401, 403, 429]) {
			const { fetcher } = fakeXero({ status });
			await expect(push('tenant', jane, ctx(fetcher))).rejects.toBeInstanceOf(SyncFatalError);
		}
	});
});

describe('xero accounts and connections', () => {
	const active = ACCOUNTS.filter((a) => !a.Status);
	it('picks accounts by code or name', () => {
		expect(pickRevenueAccount(active, '').Code).toBe('210');
		expect(pickRevenueAccount(active, '200').Code).toBe('200');
		expect(pickRevenueAccount(active, 'sales').Code).toBe('200');
		expect(() => pickRevenueAccount(active, '090')).toThrow(SyncFatalError);
		expect(pickBankAccount(active, '').AccountID).toBe('a-bank');
		expect(pickBankAccount(active, 'business bank account').AccountID).toBe('a-bank');
		expect(() => pickBankAccount([], '')).toThrow(SyncFatalError);
	});

	it('prefers the organisation picked in this sign-in', () => {
		const list = [
			{
				tenantId: 'a',
				tenantType: 'ORGANISATION',
				authEventId: 'e1',
				updatedDateUtc: '2026-01-02'
			},
			{
				tenantId: 'b',
				tenantType: 'ORGANISATION',
				authEventId: 'e2',
				updatedDateUtc: '2026-01-01'
			},
			{ tenantId: 'p', tenantType: 'PRACTICE', authEventId: 'e2', updatedDateUtc: '2026-01-03' }
		];
		expect(pickOrganisation(list, 'e2')?.tenantId).toBe('b');
		expect(pickOrganisation(list, null)?.tenantId).toBe('a');
		expect(pickOrganisation([], null)).toBeUndefined();
		const jwt = `h.${Buffer.from(JSON.stringify({ authentication_event_id: 'e2' })).toString('base64url')}.s`;
		expect(authEventId(jwt)).toBe('e2');
		expect(authEventId('opaque')).toBeNull();
	});

	it('reports validation errors from Xero', () => {
		expect(
			problemMessage(
				{
					Message: 'A validation exception occurred',
					Elements: [{ ValidationErrors: [{ Message: 'Account code is not valid' }] }]
				},
				400
			)
		).toBe('Account code is not valid');
		expect(problemMessage(null, 500)).toBe('Xero returned HTTP 500');
	});
});
