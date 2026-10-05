import { randomUUID } from 'node:crypto';
import { error } from '@sveltejs/kit';
import {
	BILT_CLIENT_ID,
	BILT_CLIENT_SECRET,
	BILT_ENVIRONMENT,
	BILT_WEBHOOK_SECRET,
	LEROA_CLOUD
} from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { recordOnlinePayment } from './record.ts';
import { secretList, verifyStandardWebhook } from './standard-webhooks.ts';
import type { PaymentProvider } from './types.ts';

const hosts = {
	production: {
		api: 'https://partnerapi.biltrewards.com',
		token: 'https://www.bilt.com/realms/enterprise-partner/protocol/openid-connect/token'
	},
	staging: {
		api: 'https://staging.partnerapi.biltrewards.com',
		token: 'https://staging.biltrewards.com/realms/enterprise-partner/protocol/openid-connect/token'
	}
};
const host = () => hosts[BILT_ENVIRONMENT === 'staging' ? 'staging' : 'production'];

const configured = () => !!BILT_CLIENT_ID && !!BILT_CLIENT_SECRET && !!BILT_WEBHOOK_SECRET;

let token: { value: string; expiresAt: number } | undefined;

/** OAuth client-credentials token for Bilt's partner gateway, cached until shortly before expiry. */
async function accessToken() {
	if (token && token.expiresAt > Date.now() + 30_000) return token.value;
	const res = await fetch(host().token, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: BILT_CLIENT_ID ?? '',
			client_secret: BILT_CLIENT_SECRET ?? ''
		}),
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`Bilt token request failed with ${res.status}`);
	const body = (await res.json()) as { access_token: string; expires_in?: number };
	token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
	return token.value;
}

type BiltEvent = {
	type: string;
	data: {
		sessionId: string;
		orderId: string;
		paymentId?: string;
		amounts?: { subtotalCents?: number; currency?: string };
	};
};

/** Order IDs carry the lease: `lr.<leaseId>.<nonce>`. Bilt echoes them on every webhook. */
const orderId = (leaseId: string) => `lr.${leaseId}.${randomUUID().slice(0, 8)}`;
const leaseFromOrder = (id: string) => /^lr\.([0-9a-f-]{36})\.[0-9a-f]+$/.exec(id)?.[1];

/**
 * Bilt Checkout: tenants pay with their linked Bilt account and earn points. Uses one partner
 * client per install, so it's only offered on self-hosted installs where the operator is the
 * merchant Bilt settles to.
 */
export const biltProvider: PaymentProvider = {
	id: 'bilt',
	name: 'Bilt',
	payLabel: 'Pay with Bilt',
	description:
		'Tenants pay with their Bilt account and earn Bilt points on rent. Bilt settles the money to you.',
	env: ['BILT_CLIENT_ID', 'BILT_CLIENT_SECRET', 'BILT_WEBHOOK_SECRET'],
	webhookEvents: ['checkout.session.completed'],
	webhookNote: 'Bilt registers this endpoint during partner onboarding.',
	newTab: true,
	configured,
	ready: () => configured() && !LEROA_CLOUD,
	setupHint: () => (LEROA_CLOUD ? 'Bilt is only available on self-hosted installs for now.' : null),
	supportsCurrency: (currency) => currency.toUpperCase() === 'USD',

	async checkout(i) {
		const id = orderId(i.leaseId);
		const bearer = await accessToken().catch((err) => {
			console.error('[bilt]', err);
			error(502, 'Bilt is unavailable right now. Try again in a few minutes.');
		});
		const res = await fetch(`${host().api}/partner/checkout/v1/checkout-sessions`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${bearer}`,
				'content-type': 'application/json',
				'idempotency-key': id
			},
			body: JSON.stringify({
				integratorCustomerId: i.tenantId,
				orderId: id,
				lineItems: [
					{
						integratorSkuId: 'rent',
						lineItemType: 'PRODUCT',
						quantity: 1,
						unitPriceCents: i.amount,
						amountCents: i.amount,
						currency: 'USD'
					}
				],
				metadata: { leroaOrgId: i.orgId, leroaLeaseId: i.leaseId }
			}),
			signal: AbortSignal.timeout(15_000)
		});
		const body = (await res.json().catch(() => ({}))) as {
			data?: { checkoutUrl?: string };
			error?: { code?: string; requestId?: string };
		};
		if (res.ok && body.data?.checkoutUrl) return body.data.checkoutUrl;
		if (body.error?.code === 'CUSTOMER_NOT_FOUND')
			error(400, 'Link your Bilt account to this home first, then try again.');
		console.error('[bilt] checkout failed', res.status, body.error?.code, body.error?.requestId);
		error(502, 'Bilt is unavailable right now. Try again in a few minutes.');
	},

	async handleWebhook(body, headers) {
		if (!verifyStandardWebhook(body, headers, secretList(BILT_WEBHOOK_SECRET))) return false;
		const event = JSON.parse(body) as BiltEvent;
		if (event.type !== 'checkout.session.completed') return true;
		const leaseId = leaseFromOrder(event.data.orderId);
		const amount = event.data.amounts?.subtotalCents;
		if (!leaseId || !amount) return true;
		const l = await db.query.lease.findFirst({ where: (l, { eq }) => eq(l.id, leaseId) });
		if (!l) return true;
		await recordOnlinePayment({
			orgId: l.organizationId,
			leaseId,
			amount,
			method: 'bilt',
			externalId: `bilt:${event.data.paymentId ?? event.data.sessionId}`,
			provider: 'Bilt'
		});
		return true;
	}
};
