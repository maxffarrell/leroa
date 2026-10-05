import { createHash } from 'node:crypto';
import {
	defineIntegration,
	SyncFatalError,
	type Connection,
	type SyncCharge,
	type SyncContext,
	type SyncPayment,
	type SyncTenant
} from '@leroa/integration-sdk';

type Config = {
	syncFrom: string;
	includeDeposits: boolean;
	revenueAccount: string;
	bankAccount: string;
};
type Ctx = SyncContext<Config>;
type Method = 'GET' | 'POST' | 'PUT';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const KIND_LABEL: Record<SyncCharge['kind'], string> = {
	rent: 'Rent',
	deposit: 'Security deposit',
	fee: 'Fee',
	utility: 'Utilities',
	other: 'Charge'
};

export const apiBase = (params: Record<string, string>) =>
	params.apiBase?.replace(/\/$/, '') || 'https://api.xero.com';

export class XeroError extends Error {
	constructor(
		message: string,
		readonly status?: number
	) {
		super(message);
	}
}

type Problem = {
	Message?: string;
	Detail?: string;
	Title?: string;
	Elements?: { ValidationErrors?: { Message?: string }[] }[];
};

/** The most specific error message in a Xero error response. */
export function problemMessage(json: Problem | null, status: number) {
	const validation = [
		...new Set(
			(json?.Elements ?? [])
				.flatMap((e) => e.ValidationErrors ?? [])
				.map((v) => v.Message)
				.filter(Boolean)
		)
	];
	if (validation.length) return validation.join('; ');
	return json?.Detail || json?.Message || json?.Title || `Xero returned HTTP ${status}`;
}

/**
 * The same request body always gets the same key, so a create that timed out isn't duplicated
 * when it is retried, while a corrected record (e.g. after a settings change) is sent fresh.
 */
export const idempotencyKey = (path: string, body: unknown) =>
	`leroa-${createHash('sha256')
		.update(`${path}\n${JSON.stringify(body)}`)
		.digest('hex')
		.slice(0, 48)}`;

async function request<T>(
	connection: Connection,
	fetcher: typeof fetch,
	method: Method,
	path: string,
	body?: unknown
): Promise<T> {
	const tenant = connection.params.tenantId;
	if (!tenant) throw new SyncFatalError('The Xero organisation is missing. Reconnect Xero.');
	const res = await fetcher(`${apiBase(connection.params)}/api.xro/2.0/${path}`, {
		method,
		headers: {
			authorization: `Bearer ${connection.accessToken}`,
			accept: 'application/json',
			'xero-tenant-id': tenant,
			...(body
				? { 'content-type': 'application/json', 'idempotency-key': idempotencyKey(path, body) }
				: {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (res.status === 401 || res.status === 403)
		throw new SyncFatalError('Xero refused the connection. Reconnect Xero.');
	if (res.status === 429)
		throw new SyncFatalError('Xero rate limit reached. The rest syncs next time.');
	const json = (await res.json().catch(() => null)) as (T & Problem) | null;
	if (!res.ok || !json) throw new XeroError(problemMessage(json, res.status), res.status);
	return json;
}

const call = <T>(ctx: Ctx, method: Method, path: string, body?: unknown) =>
	request<T>(ctx.connection, ctx.fetch, method, path, body);

function cached<T>(ctx: Ctx, key: string, load: () => Promise<T>): Promise<T> {
	if (!ctx.cache.has(key)) ctx.cache.set(key, load());
	return ctx.cache.get(key) as Promise<T>;
}

const baseCurrency = (ctx: Ctx) =>
	cached(ctx, 'currency', async () => {
		const r = await call<{ Organisations?: { BaseCurrency?: string }[] }>(
			ctx,
			'GET',
			'Organisation'
		);
		const currency = r.Organisations?.[0]?.BaseCurrency;
		if (!currency) throw new SyncFatalError('Could not read the Xero organisation’s currency.');
		return currency;
	});

type Account = {
	AccountID: string;
	Code?: string;
	Name: string;
	Type?: string;
	Class?: string;
	Status?: string;
	EnablePaymentsToAccount?: boolean;
};

const accounts = (ctx: Ctx) =>
	cached(ctx, 'accounts', async () => {
		const r = await call<{ Accounts?: Account[] }>(ctx, 'GET', 'Accounts');
		return (r.Accounts ?? []).filter((a) => !a.Status || a.Status === 'ACTIVE');
	});

/** An account matched by code or name (case-insensitive). */
export function findAccount(list: Account[], wanted: string) {
	const w = wanted.trim().toLowerCase();
	return (
		list.find((a) => a.Code?.toLowerCase() === w) ?? list.find((a) => a.Name.toLowerCase() === w)
	);
}

export function pickRevenueAccount(list: Account[], wanted: string) {
	const revenue = list.filter((a) => a.Class === 'REVENUE' && a.Code);
	if (wanted.trim()) {
		const match = findAccount(revenue, wanted);
		if (!match)
			throw new SyncFatalError(
				`Xero has no active revenue account "${wanted.trim()}" with a code.`
			);
		return match;
	}
	const match =
		revenue.find((a) => /rent/i.test(a.Name)) ??
		revenue.find((a) => a.Type === 'REVENUE') ??
		revenue[0];
	if (!match) throw new SyncFatalError('Xero has no active revenue account to post rent to.');
	return match;
}

export function pickBankAccount(list: Account[], wanted: string) {
	const payable = list.filter((a) => a.Type === 'BANK' || a.EnablePaymentsToAccount);
	if (wanted.trim()) {
		const match = findAccount(payable, wanted);
		if (!match)
			throw new SyncFatalError(
				`Xero has no active bank account "${wanted.trim()}" that accepts payments.`
			);
		return match;
	}
	const match = payable.find((a) => a.Type === 'BANK') ?? payable[0];
	if (!match) throw new SyncFatalError('Xero has no bank account to record payments in.');
	return match;
}

const revenueAccount = (ctx: Ctx) =>
	cached(ctx, 'revenue', async () =>
		pickRevenueAccount(await accounts(ctx), ctx.config.revenueAccount ?? '')
	);
const bankAccount = (ctx: Ctx) =>
	cached(ctx, 'bank', async () =>
		pickBankAccount(await accounts(ctx), ctx.config.bankAccount ?? '')
	);

/** Xero contact names are unique per organisation and at most 255 characters. */
export const contactName = (t: Pick<SyncTenant, 'name' | 'email'>) =>
	(t.name.trim() || t.email || 'Tenant').replace(/\s+/g, ' ').trim().slice(0, 255);

const money = (minor: number) => Math.round(minor) / 100;

type Contact = { ContactID: string; Name: string; EmailAddress?: string };

async function pushTenant(t: SyncTenant, ctx: Ctx) {
	const name = contactName(t);
	const found = await call<{ Contacts?: Contact[] }>(
		ctx,
		'GET',
		`Contacts?searchTerm=${encodeURIComponent(name)}`
	);
	const existing = found.Contacts?.find((c) => c.Name.toLowerCase() === name.toLowerCase());
	const ours = t.email?.toLowerCase();
	const theirs = existing?.EmailAddress?.toLowerCase();
	// Reuse a contact someone already entered by hand, unless it's clearly a different person.
	if (existing && (!ours || !theirs || ours === theirs)) return { externalId: existing.ContactID };
	const r = await call<{ Contacts: Contact[] }>(ctx, 'PUT', 'Contacts', {
		Contacts: [
			{
				Name: existing ? `${name} (${t.email})`.slice(0, 255) : name,
				...(t.companyName
					? {}
					: {
							...(t.firstName ? { FirstName: t.firstName.slice(0, 255) } : {}),
							...(t.lastName ? { LastName: t.lastName.slice(0, 255) } : {})
						}),
				...(t.email ? { EmailAddress: t.email.slice(0, 255) } : {}),
				...(t.phone
					? { Phones: [{ PhoneType: 'DEFAULT', PhoneNumber: t.phone.slice(0, 50) }] }
					: {})
			}
		]
	});
	return { externalId: r.Contacts[0]!.ContactID };
}

async function pushCharge(c: SyncCharge, ctx: Ctx) {
	if (c.kind === 'deposit' && !ctx.config.includeDeposits)
		return { skip: 'Security deposits are turned off in the Xero settings' };
	if (c.amount <= 0) return { skip: 'Nothing to invoice' };
	const base = await baseCurrency(ctx);
	if (c.currency !== base)
		return { skip: `Charged in ${c.currency}, but the Xero organisation uses ${base}` };
	const contact = ctx.externalId('tenant', c.tenantId);
	if (!contact) throw new Error('The tenant could not be added to Xero');
	const account = await revenueAccount(ctx);
	const r = await call<{ Invoices: { InvoiceID: string }[] }>(ctx, 'PUT', 'Invoices', {
		Invoices: [
			{
				Type: 'ACCREC',
				Contact: { ContactID: contact },
				Date: c.dueDate,
				DueDate: c.dueDate,
				Reference: `${c.property} · ${c.unit}`.slice(0, 255),
				CurrencyCode: c.currency,
				// The tenant owes exactly the charged amount; any tax on the account is included in it.
				LineAmountTypes: 'Inclusive',
				Status: 'AUTHORISED',
				LineItems: [
					{
						Description: (c.description || KIND_LABEL[c.kind]).slice(0, 4000),
						Quantity: 1,
						UnitAmount: money(c.amount),
						AccountCode: account.Code
					}
				]
			}
		]
	});
	return { externalId: r.Invoices[0]!.InvoiceID };
}

async function pushPayment(p: SyncPayment, ctx: Ctx) {
	if (p.chargeKind === 'deposit' && !ctx.config.includeDeposits)
		return { skip: 'Paid toward a security deposit, which is not synced' };
	if (!p.chargeId)
		return { skip: 'Not applied to a charge. Xero records payments against invoices only.' };
	const base = await baseCurrency(ctx);
	if (p.currency !== base)
		return { skip: `Paid in ${p.currency}, but the Xero organisation uses ${base}` };
	const invoice = ctx.externalId('charge', p.chargeId);
	if (!invoice) throw new Error('The charge it paid is not in Xero yet');
	const account = await bankAccount(ctx);
	const r = await call<{ Payments: { PaymentID: string }[] }>(ctx, 'PUT', 'Payments', {
		Payments: [
			{
				Invoice: { InvoiceID: invoice },
				Account: { AccountID: account.AccountID },
				Date: p.receivedOn,
				Amount: money(p.amount),
				Reference: [p.reference, `Leroa ${p.method}`].filter(Boolean).join(' · ').slice(0, 255)
			}
		]
	});
	return { externalId: r.Payments[0]!.PaymentID };
}

async function removePayment(externalId: string, ctx: Ctx) {
	try {
		await call(ctx, 'POST', `Payments/${encodeURIComponent(externalId)}`, { Status: 'DELETED' });
	} catch (err) {
		if (err instanceof XeroError && (err.status === 404 || /already.*deleted/i.test(err.message)))
			return;
		throw err;
	}
}

type XeroConnection = {
	tenantId: string;
	tenantName?: string;
	tenantType?: string;
	authEventId?: string;
	updatedDateUtc?: string;
};

/** The `authentication_event_id` claim of a Xero access token, which identifies this sign-in. */
export function authEventId(accessToken: string) {
	try {
		const payload = JSON.parse(
			Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString()
		);
		return typeof payload.authentication_event_id === 'string'
			? payload.authentication_event_id
			: null;
	} catch {
		return null;
	}
}

/** The organisation picked in this sign-in, or else the one connected most recently. */
export function pickOrganisation(list: XeroConnection[], eventId: string | null) {
	const orgs = list.filter((c) => !c.tenantType || c.tenantType === 'ORGANISATION');
	const fromThisSignIn = eventId ? orgs.filter((c) => c.authEventId === eventId) : [];
	return [...(fromThisSignIn.length ? fromThisSignIn : orgs)].sort((a, b) =>
		(b.updatedDateUtc ?? '').localeCompare(a.updatedDateUtc ?? '')
	)[0];
}

const firstOfMonth = () => new Date().toISOString().slice(0, 8) + '01';

export default defineIntegration<Config>({
	id: 'xero',
	name: 'Xero',
	description:
		'Send tenants, charges and payments to Xero as contacts, sales invoices and invoice payments.',
	category: 'accounting-export',
	author: { name: 'Leroa', url: 'https://github.com/leroa' },
	homepage: 'https://developer.xero.com/documentation/api/accounting/overview',
	icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22ZM7.7 7.3 6.3 8.7 9.6 12l-3.3 3.3 1.4 1.4 3.3-3.3 3.3 3.3 1.4-1.4-3.3-3.3 3.3-3.3-1.4-1.4-3.3 3.3-3.3-3.3Z"/></svg>',
	config: [
		{
			key: 'syncFrom',
			label: 'Sync records from',
			type: 'text',
			placeholder: 'YYYY-MM-DD',
			description:
				'Charges due and payments received before this date stay out of Xero, so history you already entered there is not duplicated. Leave empty to send everything.'
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
			key: 'revenueAccount',
			label: 'Revenue account',
			type: 'text',
			placeholder: '200 or Rental Income',
			description:
				'Code or name of the Xero revenue account invoices are posted to. Defaults to a revenue account with "rent" in its name. Amounts include any tax set on that account.'
		},
		{
			key: 'bankAccount',
			label: 'Bank account for payments',
			type: 'text',
			placeholder: '090 or Business Bank Account',
			description:
				'Code or name of the Xero bank account payments are recorded in. Defaults to the first bank account.'
		}
	],
	events: [],
	defaults: () => ({
		syncFrom: firstOfMonth(),
		includeDeposits: false,
		revenueAccount: '',
		bankAccount: ''
	}),
	validate: (c) =>
		c.syncFrom && !(ISO_DATE.test(c.syncFrom) && !Number.isNaN(Date.parse(c.syncFrom)))
			? 'Sync records from must be a date like 2026-01-01'
			: null,
	oauth: {
		authorizeUrl: 'https://login.xero.com/identity/connect/authorize',
		tokenUrl: 'https://identity.xero.com/connect/token',
		revokeUrl: 'https://identity.xero.com/connect/revocation',
		scopes: [
			'offline_access',
			'accounting.contacts',
			'accounting.transactions',
			'accounting.settings.read'
		],
		async account(connection, fetcher) {
			const res = await fetcher(`${apiBase(connection.params)}/connections`, {
				headers: { authorization: `Bearer ${connection.accessToken}`, accept: 'application/json' }
			});
			if (!res.ok) throw new Error(`Could not list your Xero organisations (HTTP ${res.status})`);
			const org = pickOrganisation(
				(await res.json()) as XeroConnection[],
				authEventId(connection.accessToken)
			);
			if (!org) throw new Error('No Xero organisation was connected. Try again and pick one.');
			return { id: org.tenantId, name: org.tenantName ?? null, params: { tenantId: org.tenantId } };
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
