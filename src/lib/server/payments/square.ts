import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	LEROA_CLOUD,
	SQUARE_ACCESS_TOKEN,
	SQUARE_ENVIRONMENT,
	SQUARE_LOCATION_ID,
	SQUARE_WEBHOOK_SIGNATURE_KEY
} from '$app/env/private';
import { appOrigin } from '#lib/server/email.ts';
import { recordOnlinePayment } from './record.ts';
import { secretList } from './standard-webhooks.ts';
import type { PaymentProvider } from './types.ts';
import { hmacValid, leaseRef, parseLeaseRef, squareMethod } from './util.ts';

const SQUARE_VERSION = '2026-09-16';

const base = () =>
	SQUARE_ENVIRONMENT === 'sandbox'
		? 'https://connect.squareupsandbox.com'
		: 'https://connect.squareup.com';

const configured = () => !!SQUARE_ACCESS_TOKEN && !!SQUARE_WEBHOOK_SIGNATURE_KEY;

function unavailable(): never {
	error(502, 'Square is unavailable right now. Try again in a few minutes.');
}

async function api<T>(path: string, body?: unknown) {
	const res = await fetch(`${base()}${path}`, {
		method: body ? 'POST' : 'GET',
		headers: {
			authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
			'square-version': SQUARE_VERSION,
			'content-type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined,
		signal: AbortSignal.timeout(15_000)
	});
	const out = (await res.json().catch(() => ({}))) as T & { errors?: { code: string }[] };
	return { ok: res.ok, status: res.status, body: out };
}

type Location = { id: string; status: string; currency: string };
let location: Location | undefined;

/** `SQUARE_LOCATION_ID`, or the account's first active location. */
async function payLocation() {
	if (location) return location;
	if (SQUARE_LOCATION_ID) {
		const r = await api<{ location?: Location }>(
			`/v2/locations/${encodeURIComponent(SQUARE_LOCATION_ID)}`
		);
		location = r.body.location;
	} else {
		const r = await api<{ locations?: Location[] }>('/v2/locations');
		location = r.body.locations?.find((l) => l.status === 'ACTIVE');
	}
	if (!location) throw new Error('No active Square location');
	return location;
}

type Payment = {
	id: string;
	status: string;
	order_id?: string;
	source_type?: string;
	amount_money?: { amount: number; currency: string };
};

/** Square Online Checkout payment links. Tenants pay by card, Apple Pay, Google Pay or Cash App. */
export const squareProvider: PaymentProvider = {
	id: 'square',
	name: 'Square',
	payLabel: 'Pay by card',
	description:
		'Tenants pay by card, Apple Pay, Google Pay or Cash App Pay on a Square checkout page. Money goes to your Square account.',
	env: ['SQUARE_ACCESS_TOKEN', 'SQUARE_WEBHOOK_SIGNATURE_KEY'],
	webhookEvents: ['payment.created', 'payment.updated'],
	webhookNote:
		'Put the subscription’s signature key in SQUARE_WEBHOOK_SIGNATURE_KEY. Square signs the exact URL, so set ORIGIN to your public address.',
	configured,
	ready: () => configured() && !LEROA_CLOUD,
	setupHint: () =>
		LEROA_CLOUD ? 'Square is only available on self-hosted installs for now.' : null,
	supportsCurrency: (currency) =>
		['USD', 'CAD', 'GBP', 'EUR', 'AUD'].includes(currency.toUpperCase()),

	async checkout(i) {
		const loc = await payLocation().catch((err) => {
			console.error('[square]', err);
			return unavailable();
		});
		const currency = i.currency.toUpperCase();
		if (loc.currency !== currency)
			error(400, `This Square account takes payments in ${loc.currency}, not ${currency}.`);
		const r = await api<{ payment_link?: { url: string } }>('/v2/online-checkout/payment-links', {
			idempotency_key: randomUUID(),
			order: {
				location_id: loc.id,
				reference_id: i.leaseId,
				metadata: { leroaRef: leaseRef(i.orgId, i.leaseId) },
				line_items: [
					{
						name: i.description.slice(0, 500),
						quantity: '1',
						base_price_money: { amount: i.amount, currency }
					}
				]
			},
			checkout_options: { redirect_url: `${appOrigin()}/portal?paid=1` },
			...(i.email ? { pre_populated_data: { buyer_email: i.email } } : {})
		}).catch((err) => {
			console.error('[square]', err);
			return unavailable();
		});
		if (r.ok && r.body.payment_link?.url) return r.body.payment_link.url;
		console.error(
			'[square] payment link failed',
			r.status,
			r.body.errors?.map((e) => e.code)
		);
		unavailable();
	},

	async handleWebhook(body, headers) {
		const url = `${appOrigin()}/api/payments/square/webhook`;
		const signature = headers.get('x-square-hmacsha256-signature');
		if (!hmacValid(body, signature, secretList(SQUARE_WEBHOOK_SIGNATURE_KEY), 'base64', url))
			return false;
		const event = JSON.parse(body) as { type: string; data?: { object?: { payment?: Payment } } };
		const p = event.data?.object?.payment;
		if (!event.type.startsWith('payment.') || p?.status !== 'COMPLETED' || !p.order_id) return true;
		const r = await api<{ order?: { metadata?: Record<string, string> } }>(
			`/v2/orders/${encodeURIComponent(p.order_id)}`
		);
		if (!r.ok) throw new Error(`Square order lookup failed with ${r.status}`);
		const ref = parseLeaseRef(r.body.order?.metadata?.leroaRef);
		if (!ref || !p.amount_money) return true; // not a Leroa checkout
		await recordOnlinePayment({
			...ref,
			amount: p.amount_money.amount,
			method: squareMethod(p.source_type),
			externalId: `square:${p.id}`,
			provider: 'Square'
		});
		return true;
	}
};
