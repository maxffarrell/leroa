import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { LEROA_CLOUD, MOLLIE_API_KEY } from '$app/env/private';
import { appOrigin } from '#lib/server/email.ts';
import { recordOnlinePayment } from './record.ts';
import type { PaymentProvider } from './types.ts';
import { fromDecimal, leaseRef, mollieMethod, parseLeaseRef, toDecimal } from './util.ts';

const API = 'https://api.mollie.com/v2';

const configured = () => !!MOLLIE_API_KEY;

const currencies = new Set('AUD CAD CHF CZK DKK EUR GBP NOK NZD PLN SEK USD'.split(' '));

function unavailable(): never {
	error(502, 'Mollie is unavailable right now. Try again in a few minutes.');
}

type MolliePayment = {
	id: string;
	status: string;
	method?: string | null;
	amount: { value: string; currency: string };
	metadata?: { leroaRef?: string } | null;
	_links?: { checkout?: { href: string } };
};

/**
 * Mollie hosted checkout (iDEAL, Bancontact, cards, SEPA and more). Mollie's webhooks carry only a
 * payment ID, so every delivery is confirmed by fetching the payment with the API key.
 */
export const mollieProvider: PaymentProvider = {
	id: 'mollie',
	name: 'Mollie',
	payLabel: 'Pay online',
	description:
		'Tenants pay with iDEAL, Bancontact, cards, SEPA transfer and other European methods on a Mollie checkout page.',
	env: ['MOLLIE_API_KEY'],
	webhookEvents: [],
	webhookNote: 'Leroa gives Mollie this URL with every payment. Nothing to set up.',
	configured,
	ready: () => configured() && !LEROA_CLOUD,
	setupHint: () =>
		LEROA_CLOUD ? 'Mollie is only available on self-hosted installs for now.' : null,
	supportsCurrency: (currency) => currencies.has(currency.toUpperCase()),

	async checkout(i) {
		const origin = appOrigin();
		const res = await fetch(`${API}/payments`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${MOLLIE_API_KEY}`,
				'content-type': 'application/json',
				'idempotency-key': randomUUID()
			},
			body: JSON.stringify({
				amount: { currency: i.currency.toUpperCase(), value: toDecimal(i.amount) },
				description: i.description.slice(0, 255),
				redirectUrl: `${origin}/portal?paid=1`,
				cancelUrl: `${origin}/portal`,
				webhookUrl: `${origin}/api/payments/mollie/webhook`,
				metadata: { leroaRef: leaseRef(i.orgId, i.leaseId) }
			}),
			signal: AbortSignal.timeout(15_000)
		}).catch((err) => {
			console.error('[mollie]', err);
			return unavailable();
		});
		const body = (await res.json().catch(() => ({}))) as Partial<MolliePayment> & {
			title?: string;
			detail?: string;
		};
		if (res.ok && body._links?.checkout?.href) return body._links.checkout.href;
		console.error('[mollie] create payment failed', res.status, body.title, body.detail);
		unavailable();
	},

	async handleWebhook(body) {
		const id = new URLSearchParams(body).get('id');
		if (!id || !/^tr_\w+$/.test(id)) return false;
		const res = await fetch(`${API}/payments/${id}`, {
			headers: { authorization: `Bearer ${MOLLIE_API_KEY}` },
			signal: AbortSignal.timeout(15_000)
		});
		if (res.status === 404) return true;
		if (!res.ok) throw new Error(`Mollie payment lookup failed with ${res.status}`);
		const p = (await res.json()) as MolliePayment;
		const ref = parseLeaseRef(p.metadata?.leroaRef);
		if (p.status !== 'paid' || !ref) return true;
		await recordOnlinePayment({
			...ref,
			amount: fromDecimal(p.amount.value),
			method: mollieMethod(p.method),
			externalId: `mollie:${p.id}`,
			provider: 'Mollie'
		});
		return true;
	}
};
