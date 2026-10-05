import { error, json } from '@sveltejs/kit';
import { verifyWebhook } from '#lib/server/stripe.ts';
import { handleStripeEvent } from '#lib/server/services/online-payments.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const signature = request.headers.get('stripe-signature');
	if (!signature) error(400, 'Missing signature');
	const event = verifyWebhook(await request.text(), signature);
	if (!event) error(400, 'Invalid signature');
	await handleStripeEvent(event);
	return json({ received: true });
};
