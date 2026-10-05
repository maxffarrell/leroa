import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	GOCARDLESS_ACCESS_TOKEN,
	GOCARDLESS_ENVIRONMENT,
	GOCARDLESS_WEBHOOK_SECRET,
	LEROA_CLOUD
} from '$app/env/private';
import { appOrigin } from '#lib/server/email.ts';
import { recordOnlinePayment } from './record.ts';
import { secretList } from './standard-webhooks.ts';
import type { PaymentProvider } from './types.ts';
import { hmacValid, leaseRef, parseLeaseRef } from './util.ts';

const base = () =>
	GOCARDLESS_ENVIRONMENT === 'sandbox'
		? 'https://api-sandbox.gocardless.com'
		: 'https://api.gocardless.com';

const configured = () => !!GOCARDLESS_ACCESS_TOKEN && !!GOCARDLESS_WEBHOOK_SECRET;

const currencies = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'SEK', 'DKK'];
/** Currencies with Instant Bank Pay; the rest need a one-off debit mandate. */
const instant = ['GBP', 'EUR'];

function unavailable(): never {
	error(502, 'GoCardless is unavailable right now. Try again in a few minutes.');
}

async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) {
	const res = await fetch(`${base()}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${GOCARDLESS_ACCESS_TOKEN}`,
			'gocardless-version': '2015-07-06',
			'content-type': 'application/json',
			...(method === 'POST' ? { 'idempotency-key': randomUUID() } : {})
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(15_000)
	});
	const out = (await res.json().catch(() => ({}))) as T & {
		error?: { type?: string; request_id?: string };
	};
	if (!res.ok)
		throw new Error(
			`GoCardless ${method} ${path.split('/')[1]} failed with ${res.status} (${out.error?.request_id})`
		);
	return out;
}

type GcEvent = {
	resource_type: string;
	action: string;
	links: { billing_request?: string; payment_request_payment?: string; payment?: string };
};
type GcPayment = { id: string; amount: number; status: string; metadata?: Record<string, string> };

/** Bank payments through GoCardless Billing Requests: Instant Bank Pay or a one-off direct debit. */
export const gocardlessProvider: PaymentProvider = {
	id: 'gocardless',
	name: 'GoCardless',
	payLabel: 'Pay by bank',
	description:
		'Tenants pay straight from their bank account: Instant Bank Pay in the UK and EU, a one-off direct debit elsewhere. Low fees, no cards.',
	env: ['GOCARDLESS_ACCESS_TOKEN', 'GOCARDLESS_WEBHOOK_SECRET'],
	webhookEvents: ['billing_requests.fulfilled', 'payments.confirmed'],
	webhookNote: 'GoCardless sends every event to the endpoint; Leroa acts on these.',
	configured,
	ready: () => configured() && !LEROA_CLOUD,
	setupHint: () =>
		LEROA_CLOUD ? 'GoCardless is only available on self-hosted installs for now.' : null,
	supportsCurrency: (currency) => currencies.includes(currency.toUpperCase()),

	async checkout(i) {
		const currency = i.currency.toUpperCase();
		const metadata = { leroa_ref: leaseRef(i.orgId, i.leaseId) };
		const origin = appOrigin();
		try {
			const { billing_requests: br } = await api<{ billing_requests: { id: string } }>(
				'POST',
				'/billing_requests',
				{
					billing_requests: {
						payment_request: {
							amount: i.amount,
							currency,
							description: i.description.slice(0, 140),
							metadata
						},
						...(instant.includes(currency) ? {} : { mandate_request: { currency } }),
						metadata
					}
				}
			);
			const { billing_request_flows: flow } = await api<{
				billing_request_flows: { authorisation_url: string };
			}>('POST', '/billing_request_flows', {
				billing_request_flows: {
					redirect_uri: `${origin}/portal?paid=1`,
					exit_uri: `${origin}/portal`,
					links: { billing_request: br.id },
					...(i.email ? { prefilled_customer: { email: i.email } } : {})
				}
			});
			return flow.authorisation_url;
		} catch (err) {
			console.error('[gocardless]', err);
			unavailable();
		}
	},

	async handleWebhook(body, headers) {
		const signature = headers.get('webhook-signature');
		if (!hmacValid(body, signature, secretList(GOCARDLESS_WEBHOOK_SECRET), 'hex')) return false;
		const { events = [] } = JSON.parse(body) as { events?: GcEvent[] };
		// Tag payments with the lease first, so a confirmation in the same batch can find it.
		const ordered = [...events].sort(
			(a, b) =>
				+(b.resource_type === 'billing_requests') - +(a.resource_type === 'billing_requests')
		);
		for (const e of ordered) {
			if (e.resource_type === 'billing_requests' && e.action === 'fulfilled') {
				const { billing_request_payment: paymentId, billing_request: brId } = {
					billing_request_payment: e.links.payment_request_payment,
					billing_request: e.links.billing_request
				};
				if (!paymentId || !brId) continue;
				const { billing_requests: br } = await api<{
					billing_requests: { metadata?: Record<string, string> };
				}>('GET', `/billing_requests/${encodeURIComponent(brId)}`);
				const ref = br.metadata?.leroa_ref;
				if (parseLeaseRef(ref))
					await api('PUT', `/payments/${encodeURIComponent(paymentId)}`, {
						payments: { metadata: { leroa_ref: ref } }
					});
			} else if (e.resource_type === 'payments' && e.action === 'confirmed' && e.links.payment) {
				const { payments: p } = await api<{ payments: GcPayment }>(
					'GET',
					`/payments/${encodeURIComponent(e.links.payment)}`
				);
				const ref = parseLeaseRef(p.metadata?.leroa_ref);
				if (!ref) continue; // not a Leroa payment
				await recordOnlinePayment({
					...ref,
					amount: p.amount,
					method: 'direct_debit',
					externalId: `gocardless:${p.id}`,
					provider: 'GoCardless'
				});
			}
		}
		return true;
	}
};
