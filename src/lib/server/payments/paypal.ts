import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	LEROA_CLOUD,
	PAYPAL_CLIENT_ID,
	PAYPAL_CLIENT_SECRET,
	PAYPAL_ENVIRONMENT,
	PAYPAL_WEBHOOK_ID
} from '$app/env/private';
import { appOrigin } from '#lib/server/email.ts';
import { recordOnlinePayment } from './record.ts';
import type { PaymentProvider } from './types.ts';
import { fromDecimal, leaseRef, parseLeaseRef, toDecimal } from './util.ts';

const base = () =>
	PAYPAL_ENVIRONMENT === 'sandbox'
		? 'https://api-m.sandbox.paypal.com'
		: 'https://api-m.paypal.com';

const configured = () => !!PAYPAL_CLIENT_ID && !!PAYPAL_CLIENT_SECRET && !!PAYPAL_WEBHOOK_ID;

// Two-decimal currencies PayPal accepts (JPY, HUF and TWD are whole units; Leroa stores cents).
const currencies = new Set(
	'AUD BRL CAD CHF CZK DKK EUR GBP HKD ILS MXN NOK NZD PHP PLN SEK SGD THB USD'.split(' ')
);

function unavailable(): never {
	error(502, 'PayPal is unavailable right now. Try again in a few minutes.');
}

let token: { value: string; expiresAt: number } | undefined;

async function accessToken() {
	if (token && token.expiresAt > Date.now() + 60_000) return token.value;
	const res = await fetch(`${base()}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials',
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`PayPal token request failed with ${res.status}`);
	const body = (await res.json()) as { access_token: string; expires_in: number };
	token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
	return token.value;
}

async function api<T>(path: string, body: string, requestId?: string) {
	const res = await fetch(`${base()}${path}`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${await accessToken()}`,
			'content-type': 'application/json',
			...(requestId ? { 'paypal-request-id': requestId } : {})
		},
		body,
		signal: AbortSignal.timeout(15_000)
	});
	return {
		res,
		body: (await res.json().catch(() => ({}))) as T & { debug_id?: string; name?: string }
	};
}

type Capture = {
	id: string;
	status: string;
	custom_id?: string;
	amount?: { value: string; currency_code: string };
};
type Order = {
	id: string;
	links?: { rel: string; href: string }[];
	purchase_units?: { custom_id?: string; payments?: { captures?: Capture[] } }[];
};

async function recordCapture(c: Capture, customId = c.custom_id) {
	const ref = parseLeaseRef(customId);
	if (c.status !== 'COMPLETED' || !ref) return;
	await recordOnlinePayment({
		...ref,
		amount: fromDecimal(c.amount?.value),
		method: 'paypal',
		externalId: `paypal:${c.id}`,
		provider: 'PayPal'
	});
}

/** Verifies a delivery with PayPal's verify-webhook-signature API, passing the raw event body back. */
async function verified(body: string, headers: Headers) {
	const h = (name: string) => JSON.stringify(headers.get(name) ?? '');
	if (!headers.get('paypal-transmission-sig')) return false;
	const { res, body: out } = await api<{ verification_status?: string }>(
		'/v1/notifications/verify-webhook-signature',
		`{"auth_algo":${h('paypal-auth-algo')},"cert_url":${h('paypal-cert-url')},"transmission_id":${h('paypal-transmission-id')},"transmission_sig":${h('paypal-transmission-sig')},"transmission_time":${h('paypal-transmission-time')},"webhook_id":${JSON.stringify(PAYPAL_WEBHOOK_ID)},"webhook_event":${body}}`
	);
	if (!res.ok && res.status >= 500)
		throw new Error(`PayPal verification failed with ${res.status}`);
	return out.verification_status === 'SUCCESS';
}

/** PayPal Checkout (Orders v2). Tenants pay with PayPal, Venmo (US) or Pay Later. */
export const paypalProvider: PaymentProvider = {
	id: 'paypal',
	name: 'PayPal',
	payLabel: 'Pay with PayPal',
	description:
		'Tenants pay with their PayPal balance, bank or card (and Venmo in the US). Money goes to your PayPal business account.',
	env: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID'],
	webhookEvents: ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED'],
	webhookNote: 'Put the webhook ID PayPal shows in PAYPAL_WEBHOOK_ID.',
	configured,
	ready: () => configured() && !LEROA_CLOUD,
	setupHint: () =>
		LEROA_CLOUD ? 'PayPal is only available on self-hosted installs for now.' : null,
	supportsCurrency: (currency) => currencies.has(currency.toUpperCase()),

	async checkout(i) {
		const origin = appOrigin();
		const { res, body } = await api<Order>(
			'/v2/checkout/orders',
			JSON.stringify({
				intent: 'CAPTURE',
				purchase_units: [
					{
						reference_id: i.leaseId,
						custom_id: leaseRef(i.orgId, i.leaseId),
						description: i.description.slice(0, 127),
						amount: { currency_code: i.currency.toUpperCase(), value: toDecimal(i.amount) }
					}
				],
				payment_source: {
					paypal: {
						experience_context: {
							return_url: `${origin}/portal?paid=1`,
							cancel_url: `${origin}/portal`,
							user_action: 'PAY_NOW',
							shipping_preference: 'NO_SHIPPING'
						}
					}
				}
			}),
			randomUUID()
		).catch((err) => {
			console.error('[paypal]', err);
			return unavailable();
		});
		const url = body.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
		if (res.ok && url) return url;
		console.error('[paypal] create order failed', res.status, body.name, body.debug_id);
		unavailable();
	},

	async handleWebhook(body, headers) {
		if (!(await verified(body, headers))) return false;
		const event = JSON.parse(body) as { event_type: string; resource: Order & Capture };
		if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
			// The payer approved; capture the money. The request ID makes retries safe.
			const id = event.resource.id;
			const { res, body: order } = await api<Order>(
				`/v2/checkout/orders/${encodeURIComponent(id)}/capture`,
				'{}',
				`capture-${id}`
			);
			if (res.status === 422) return true; // already captured or not capturable
			if (!res.ok) throw new Error(`PayPal capture failed with ${res.status} (${order.debug_id})`);
			for (const unit of order.purchase_units ?? [])
				for (const c of unit.payments?.captures ?? [])
					await recordCapture(c, c.custom_id ?? unit.custom_id);
		} else if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
			await recordCapture(event.resource);
		}
		return true;
	}
};
