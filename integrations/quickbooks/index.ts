import {
	defineIntegration,
	SyncFatalError,
	type Connection,
	type SyncCharge,
	type SyncContext,
	type SyncPayment,
	type SyncTenant
} from '@leroa/integration-sdk';

type Config = { syncFrom: string; includeDeposits: boolean; incomeAccount: string };
type Ctx = SyncContext<Config>;

/** Intuit's oldest supported minor version of the Accounting API. */
const MINOR_VERSION = '75';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ITEM_NAMES: Record<SyncCharge['kind'], string> = {
	rent: 'Rent',
	deposit: 'Security deposit',
	fee: 'Fees',
	utility: 'Utilities',
	other: 'Other charges'
};

export function apiBase(params: Record<string, string>) {
	if (params.apiBase) return params.apiBase.replace(/\/$/, '');
	return params.environment === 'sandbox'
		? 'https://sandbox-quickbooks.api.intuit.com'
		: 'https://quickbooks.api.intuit.com';
}

export class QboError extends Error {
	constructor(
		message: string,
		readonly code?: string,
		readonly status?: number
	) {
		super(message);
	}
}

type Fault = { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] } };

async function request<T>(
	connection: Connection,
	fetcher: typeof fetch,
	method: 'GET' | 'POST',
	path: string,
	body?: unknown
): Promise<T> {
	const realm = connection.params.realmId;
	if (!realm)
		throw new SyncFatalError('The QuickBooks company ID is missing. Reconnect QuickBooks.');
	const sep = path.includes('?') ? '&' : '?';
	const res = await fetcher(
		`${apiBase(connection.params)}/v3/company/${encodeURIComponent(realm)}/${path}${sep}minorversion=${MINOR_VERSION}`,
		{
			method,
			headers: {
				authorization: `Bearer ${connection.accessToken}`,
				accept: 'application/json',
				...(body ? { 'content-type': 'application/json' } : {})
			},
			body: body ? JSON.stringify(body) : undefined
		}
	);
	if (res.status === 401 || res.status === 403)
		throw new SyncFatalError('QuickBooks refused the connection. Reconnect QuickBooks.');
	if (res.status === 429)
		throw new SyncFatalError('QuickBooks rate limit reached. The rest syncs next time.');
	const json = (await res.json().catch(() => null)) as (T & Fault) | null;
	const fault = json?.Fault?.Error?.[0];
	if (!res.ok || fault || !json) {
		const message = fault
			? [...new Set([fault.Message, fault.Detail].filter(Boolean))].join(': ')
			: `QuickBooks returned HTTP ${res.status}`;
		throw new QboError(message, fault?.code, res.status);
	}
	return json;
}

const call = <T>(ctx: Ctx, method: 'GET' | 'POST', path: string, body?: unknown) =>
	request<T>(ctx.connection, ctx.fetch, method, path, body);

/** Quotes a string literal for the QuickBooks query language. */
export const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function query<T>(ctx: Ctx, entity: string, q: string): Promise<T[]> {
	const r = await call<{ QueryResponse?: Record<string, T[]> }>(
		ctx,
		'GET',
		`query?query=${encodeURIComponent(q)}`
	);
	return r.QueryResponse?.[entity] ?? [];
}

function cached<T>(ctx: Ctx, key: string, load: () => Promise<T>): Promise<T> {
	if (!ctx.cache.has(key)) ctx.cache.set(key, load());
	return ctx.cache.get(key) as Promise<T>;
}

const homeCurrency = (ctx: Ctx) =>
	cached(ctx, 'currency', async () => {
		const r = await call<{
			Preferences?: { CurrencyPrefs?: { HomeCurrency?: { value?: string } } };
		}>(ctx, 'GET', 'preferences');
		return r.Preferences?.CurrencyPrefs?.HomeCurrency?.value ?? 'USD';
	});

const incomeAccount = (ctx: Ctx) =>
	cached(ctx, 'income-account', async () => {
		const accounts = await query<{ Id: string; Name: string }>(
			ctx,
			'Account',
			"select * from Account where AccountType = 'Income' and Active = true maxresults 1000"
		);
		const wanted = ctx.config.incomeAccount?.trim().toLowerCase();
		const match = wanted
			? accounts.find((a) => a.Name.toLowerCase() === wanted)
			: (accounts.find((a) => /rent/i.test(a.Name)) ?? accounts[0]);
		if (!match)
			throw new SyncFatalError(
				wanted
					? `QuickBooks has no active income account named "${ctx.config.incomeAccount.trim()}".`
					: 'QuickBooks has no active income account to post rent to.'
			);
		return match.Id;
	});

const itemFor = (ctx: Ctx, kind: SyncCharge['kind']) =>
	cached(ctx, `item:${kind}`, async () => {
		const name = ITEM_NAMES[kind];
		const [existing] = await query<{ Id: string }>(
			ctx,
			'Item',
			`select * from Item where Name = ${quote(name)}`
		);
		if (existing) return existing.Id;
		const r = await call<{ Item: { Id: string } }>(ctx, 'POST', 'item', {
			Name: name,
			Type: 'Service',
			IncomeAccountRef: { value: await incomeAccount(ctx) }
		});
		return r.Item.Id;
	});

/** QuickBooks display names can't contain colons, tabs or newlines. */
export const displayName = (t: Pick<SyncTenant, 'name' | 'email'>) =>
	(t.name.trim() || t.email || 'Tenant')
		.replace(/[:\t\r\n]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 100);

const money = (minor: number) => Math.round(minor) / 100;

async function pushTenant(t: SyncTenant, ctx: Ctx) {
	const name = displayName(t);
	const [existing] = await query<{ Id: string; PrimaryEmailAddr?: { Address?: string } }>(
		ctx,
		'Customer',
		`select * from Customer where DisplayName = ${quote(name)}`
	);
	const ours = t.email?.toLowerCase();
	const theirs = existing?.PrimaryEmailAddr?.Address?.toLowerCase();
	// Reuse a customer someone already entered by hand, unless it's clearly a different person.
	if (existing && (!ours || !theirs || ours === theirs)) return { externalId: existing.Id };
	const r = await call<{ Customer: { Id: string } }>(ctx, 'POST', 'customer', {
		DisplayName: existing ? `${name} (${t.email})`.slice(0, 500) : name,
		...(t.companyName
			? { CompanyName: t.companyName.slice(0, 100) }
			: {
					...(t.firstName ? { GivenName: t.firstName.slice(0, 100) } : {}),
					...(t.lastName ? { FamilyName: t.lastName.slice(0, 100) } : {})
				}),
		...(t.email ? { PrimaryEmailAddr: { Address: t.email } } : {}),
		...(t.phone ? { PrimaryPhone: { FreeFormNumber: t.phone.slice(0, 30) } } : {}),
		Notes: `Leroa tenant ${t.id}`
	});
	return { externalId: r.Customer.Id };
}

async function pushCharge(c: SyncCharge, ctx: Ctx) {
	if (c.kind === 'deposit' && !ctx.config.includeDeposits)
		return { skip: 'Security deposits are turned off in the QuickBooks settings' };
	if (c.amount <= 0) return { skip: 'Nothing to invoice' };
	const home = await homeCurrency(ctx);
	if (c.currency !== home)
		return { skip: `Charged in ${c.currency}, but the QuickBooks company uses ${home}` };
	const customer = ctx.externalId('tenant', c.tenantId);
	if (!customer) throw new Error('The tenant could not be added to QuickBooks');
	const amount = money(c.amount);
	const r = await call<{ Invoice: { Id: string } }>(ctx, 'POST', 'invoice', {
		CustomerRef: { value: customer },
		TxnDate: c.dueDate,
		DueDate: c.dueDate,
		PrivateNote: `Leroa charge ${c.id}`,
		CustomerMemo: { value: `${c.property} · ${c.unit}`.slice(0, 1000) },
		Line: [
			{
				DetailType: 'SalesItemLineDetail',
				Amount: amount,
				Description: (c.description || ITEM_NAMES[c.kind]).slice(0, 4000),
				SalesItemLineDetail: {
					ItemRef: { value: await itemFor(ctx, c.kind) },
					Qty: 1,
					UnitPrice: amount,
					...(c.periodStart ? { ServiceDate: c.periodStart } : {})
				}
			}
		]
	});
	return { externalId: r.Invoice.Id };
}

async function pushPayment(p: SyncPayment, ctx: Ctx) {
	if (p.chargeKind === 'deposit' && !ctx.config.includeDeposits)
		return { skip: 'Paid toward a security deposit, which is not synced' };
	const home = await homeCurrency(ctx);
	if (p.currency !== home)
		return { skip: `Paid in ${p.currency}, but the QuickBooks company uses ${home}` };
	const customer = ctx.externalId('tenant', p.tenantId);
	if (!customer) throw new Error('The tenant could not be added to QuickBooks');
	const invoice = p.chargeId ? ctx.externalId('charge', p.chargeId) : undefined;
	if (p.chargeId && !invoice) throw new Error('The charge it paid is not in QuickBooks yet');
	const amount = money(p.amount);
	const r = await call<{ Payment: { Id: string } }>(ctx, 'POST', 'payment', {
		CustomerRef: { value: customer },
		TotalAmt: amount,
		TxnDate: p.receivedOn,
		...(p.reference ? { PaymentRefNum: p.reference.slice(0, 21) } : {}),
		PrivateNote: `Leroa payment ${p.id} (${p.method})`,
		// Without a linked invoice, QuickBooks keeps the payment as customer credit.
		Line: invoice ? [{ Amount: amount, LinkedTxn: [{ TxnId: invoice, TxnType: 'Invoice' }] }] : []
	});
	return { externalId: r.Payment.Id };
}

async function removePayment(externalId: string, ctx: Ctx) {
	let syncToken: string;
	try {
		const r = await call<{ Payment: { SyncToken: string } }>(
			ctx,
			'GET',
			`payment/${encodeURIComponent(externalId)}`
		);
		syncToken = r.Payment.SyncToken;
	} catch (err) {
		// 610: already deleted in QuickBooks.
		if (err instanceof QboError && (err.code === '610' || err.status === 404)) return;
		throw err;
	}
	await call(ctx, 'POST', 'payment?operation=delete', { Id: externalId, SyncToken: syncToken });
}

const firstOfMonth = () => new Date().toISOString().slice(0, 8) + '01';

export default defineIntegration<Config>({
	id: 'quickbooks',
	name: 'QuickBooks Online',
	description:
		'Send tenants, charges and payments to QuickBooks Online as customers, invoices and payments.',
	category: 'accounting-export',
	author: { name: 'Leroa', url: 'https://github.com/leroa' },
	homepage: 'https://developer.intuit.com/app/developer/qbo/docs/get-started',
	icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22ZM7.5 7a4.5 4.5 0 0 0 0 9h1v-2h-1a2.5 2.5 0 0 1 0-5H10v10h2V7H7.5Zm9 10a4.5 4.5 0 0 0 0-9h-1v2h1a2.5 2.5 0 0 1 0 5H14V5h-2v12h4.5Z"/></svg>',
	config: [
		{
			key: 'syncFrom',
			label: 'Sync records from',
			type: 'text',
			placeholder: 'YYYY-MM-DD',
			description:
				'Charges due and payments received before this date stay out of QuickBooks, so history you already entered there is not duplicated. Leave empty to send everything.'
		},
		{
			key: 'includeDeposits',
			label: 'Sync security deposits',
			type: 'boolean',
			default: false,
			description:
				'Off by default: deposits are usually held as a liability, not income. Ask your accountant before turning this on.'
		},
		{
			key: 'incomeAccount',
			label: 'Income account',
			type: 'text',
			placeholder: 'Rental Income',
			description:
				'QuickBooks income account for the Rent, Fees and other items Leroa creates. Defaults to an account with "rent" in its name.'
		}
	],
	events: [],
	defaults: () => ({ syncFrom: firstOfMonth(), includeDeposits: false, incomeAccount: '' }),
	validate: (c) =>
		c.syncFrom && !(ISO_DATE.test(c.syncFrom) && !Number.isNaN(Date.parse(c.syncFrom)))
			? 'Sync records from must be a date like 2026-01-01'
			: null,
	oauth: {
		authorizeUrl: 'https://appcenter.intuit.com/connect/oauth2',
		tokenUrl: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
		revokeUrl: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
		revokeBody: 'json',
		scopes: ['com.intuit.quickbooks.accounting'],
		callbackParams: ['realmId'],
		accountParam: 'realmId',
		async accountName(connection, fetcher) {
			const r = await request<{ CompanyInfo?: { CompanyName?: string } }>(
				connection,
				fetcher,
				'GET',
				`companyinfo/${encodeURIComponent(connection.params.realmId ?? '')}`
			);
			return r.CompanyInfo?.CompanyName ?? null;
		}
	},
	sync: {
		since: (c) => (c.syncFrom && ISO_DATE.test(c.syncFrom) ? c.syncFrom : null),
		triggers: ['payment.recorded', 'charge.created', 'lease.created'],
		push(type, record, ctx) {
			if (type === 'tenant') return pushTenant(record as SyncTenant, ctx);
			if (type === 'charge') return pushCharge(record as SyncCharge, ctx);
			return pushPayment(record as SyncPayment, ctx);
		},
		async remove(type, externalId, ctx) {
			if (type === 'payment') await removePayment(externalId, ctx);
		}
	}
});
