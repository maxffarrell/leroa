import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$app/env/private';

let client: Stripe | undefined;

export const stripeConfigured = () => !!STRIPE_SECRET_KEY && !!STRIPE_WEBHOOK_SECRET;

export function stripe() {
	if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
	client ??= new Stripe(STRIPE_SECRET_KEY, { appInfo: { name: 'Leroa' } });
	return client;
}

/** Verifies a webhook against any of the configured signing secrets. */
export function verifyWebhook(body: string, signature: string): Stripe.Event | null {
	const secrets = (STRIPE_WEBHOOK_SECRET ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	for (const secret of secrets) {
		try {
			return Stripe.webhooks.constructEvent(body, signature, secret);
		} catch {
			// try the next secret
		}
	}
	return null;
}
