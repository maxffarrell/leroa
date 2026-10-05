import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type Stripe from 'stripe';
import { LEROA_CLOUD } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	lease,
	leaseTenant,
	payment,
	paymentSettings,
	property,
	tenant,
	unit,
	user
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import { allocate } from '#lib/server/allocation.ts';
import { appOrigin } from '#lib/server/email.ts';
import { stripe, stripeConfigured } from '#lib/server/stripe.ts';
import { formatMoney, todayISO } from '#lib/format.ts';
import { emit } from './events.ts';
import { getLease } from './leasing.ts';

async function settingsRow(orgId: string) {
	const [row] = await db
		.select()
		.from(paymentSettings)
		.where(eq(paymentSettings.organizationId, orgId));
	return row ?? null;
}

async function upsert(orgId: string, set: Partial<typeof paymentSettings.$inferInsert>) {
	await db
		.insert(paymentSettings)
		.values({ organizationId: orgId, ...set })
		.onConflictDoUpdate({ target: paymentSettings.organizationId, set });
}

/**
 * Self-hosted installs can take payments straight into the install's own Stripe account.
 * On Leroa Cloud every workspace must connect its own account.
 */
function accountReady(row: typeof paymentSettings.$inferSelect | null) {
	if (!stripeConfigured()) return false;
	if (row?.stripeAccountId) return row.stripeChargesEnabled;
	return !LEROA_CLOUD;
}

export async function onlinePaymentsEnabledFor(orgIds: string[]) {
	if (!stripeConfigured() || !orgIds.length) return new Set<string>();
	const rows = await db
		.select()
		.from(paymentSettings)
		.where(inArray(paymentSettings.organizationId, orgIds));
	return new Set(
		rows.filter((r) => r.onlineEnabled && accountReady(r)).map((r) => r.organizationId)
	);
}

export async function paymentSettingsView(orgId: string) {
	let row = await settingsRow(orgId);
	if (row?.stripeAccountId && stripeConfigured()) {
		const account = await stripe().accounts.retrieve(row.stripeAccountId);
		if (account.charges_enabled !== row.stripeChargesEnabled) {
			await upsert(orgId, { stripeChargesEnabled: account.charges_enabled });
			row = { ...row, stripeChargesEnabled: account.charges_enabled };
		}
	}
	return {
		configured: stripeConfigured(),
		requiresConnect: LEROA_CLOUD,
		enabled: row?.onlineEnabled ?? false,
		ready: accountReady(row),
		account: row?.stripeAccountId
			? { id: row.stripeAccountId, chargesEnabled: row.stripeChargesEnabled }
			: null,
		webhookUrl: `${appOrigin()}/api/stripe/webhook`
	};
}

export async function setOnlinePayments(ctx: OrgContext, enabled: boolean) {
	if (enabled && !accountReady(await settingsRow(ctx.orgId)))
		error(400, 'Finish connecting Stripe first');
	await upsert(ctx.orgId, { onlineEnabled: enabled });
}

/** Starts (or resumes) Stripe Connect onboarding and returns the Stripe-hosted URL. */
export async function connectStripe(ctx: OrgContext) {
	if (!stripeConfigured()) error(400, 'Stripe is not set up on this server');
	const row = await settingsRow(ctx.orgId);
	let accountId = row?.stripeAccountId;
	if (!accountId) {
		const [me] = await db.select({ email: user.email }).from(user).where(eq(user.id, ctx.userId));
		const account = await stripe().accounts.create({
			type: 'standard',
			email: me?.email,
			business_profile: { name: ctx.org.name },
			metadata: { leroaOrgId: ctx.orgId }
		});
		accountId = account.id;
		await upsert(ctx.orgId, { stripeAccountId: accountId, stripeChargesEnabled: false });
	}
	const base = `${appOrigin()}/settings/payments`;
	const link = await stripe().accountLinks.create({
		account: accountId,
		type: 'account_onboarding',
		refresh_url: `${base}?connect=retry`,
		return_url: `${base}?connect=done`
	});
	return link.url;
}

export async function disconnectStripe(ctx: OrgContext) {
	await upsert(ctx.orgId, {
		stripeAccountId: null,
		stripeChargesEnabled: false,
		onlineEnabled: false
	});
}

/** Creates a Stripe Checkout session for a tenant's current balance. */
export async function createCheckout(userId: string, leaseId: string) {
	const [row] = await db
		.select({
			orgId: lease.organizationId,
			currency: lease.currency,
			tenantId: tenant.id,
			email: tenant.email,
			unitName: unit.name,
			propertyName: property.name
		})
		.from(leaseTenant)
		.innerJoin(tenant, eq(tenant.id, leaseTenant.tenantId))
		.innerJoin(lease, eq(lease.id, leaseTenant.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(and(eq(leaseTenant.leaseId, leaseId), eq(tenant.portalUserId, userId)));
	if (!row) error(404, 'Lease not found');

	const settings = await settingsRow(row.orgId);
	if (!settings?.onlineEnabled || !accountReady(settings))
		error(400, 'Online payments are not available for this home');

	const { balance } = await getLease(row.orgId, leaseId);
	if (balance <= 0) error(400, 'Nothing is due right now');

	const metadata = { leroaOrgId: row.orgId, leroaLeaseId: leaseId, leroaTenantId: row.tenantId };
	const session = await stripe().checkout.sessions.create(
		{
			mode: 'payment',
			line_items: [
				{
					quantity: 1,
					price_data: {
						currency: row.currency.toLowerCase(),
						unit_amount: balance,
						product_data: { name: `Rent · ${row.propertyName} · ${row.unitName}` }
					}
				}
			],
			customer_email: row.email ?? undefined,
			client_reference_id: leaseId,
			metadata,
			payment_intent_data: { metadata },
			success_url: `${appOrigin()}/portal?paid=1`,
			cancel_url: `${appOrigin()}/portal`
		},
		settings.stripeAccountId ? { stripeAccount: settings.stripeAccountId } : undefined
	);
	if (!session.url) error(502, 'Stripe did not return a checkout link');
	return session.url;
}

/** Records a payment for a paid Checkout session. Safe to call more than once per session. */
async function recordCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
	if (session.payment_status !== 'paid' || !session.amount_total) return;
	const orgId = session.metadata?.leroaOrgId;
	const leaseId = session.metadata?.leroaLeaseId;
	if (!orgId || !leaseId) return;

	const settings = await settingsRow(orgId);
	if ((event.account ?? null) !== (settings?.stripeAccountId ?? null)) return;
	const l = await db.query.lease.findFirst({
		where: (l, { and, eq }) => and(eq(l.organizationId, orgId), eq(l.id, leaseId))
	});
	if (!l) return;

	const intent =
		typeof session.payment_intent === 'string'
			? session.payment_intent
			: session.payment_intent?.id;
	const ref = intent ?? session.id;
	const amount = session.amount_total;
	// Bank debits complete later through `async_payment_succeeded`; cards complete immediately.
	const method = event.type === 'checkout.session.async_payment_succeeded' ? 'ach' : 'card';
	const today = todayISO();

	const rows = await db.transaction(async (tx) => {
		const open = await tx
			.select({
				id: charge.id,
				open: sql<number>`${charge.amount} - coalesce((select sum(p.amount) from ${payment} p where p.charge_id = "charge"."id"), 0)`.mapWith(
					Number
				)
			})
			.from(charge)
			.where(and(eq(charge.leaseId, leaseId), lte(charge.dueDate, today)))
			.orderBy(asc(charge.dueDate), asc(charge.createdAt));
		const parts = allocate(amount, open);
		const inserted = [];
		for (const [i, part] of parts.entries()) {
			const [row] = await tx
				.insert(payment)
				.values({
					organizationId: orgId,
					leaseId,
					chargeId: part.chargeId,
					amount: part.amount,
					receivedOn: today,
					method,
					reference: ref,
					notes: 'Paid online with Stripe',
					// The unique index on the first part makes replayed webhooks a no-op.
					externalId: i === 0 ? ref : `${ref}:${i}`
				})
				.onConflictDoNothing()
				.returning();
			if (!row) return [];
			inserted.push(row);
		}
		return inserted;
	});
	const p = rows[0];
	if (!p) return;
	await emit({
		orgId,
		entityType: 'payment',
		entityId: p.id,
		action: 'recorded',
		summary: `${formatMoney(amount, l.currency)} paid online`,
		data: { leaseId, amount, method, online: true, payments: rows.map((r) => r.id) }
	});
}

export async function handleStripeEvent(event: Stripe.Event) {
	switch (event.type) {
		case 'checkout.session.completed':
		case 'checkout.session.async_payment_succeeded':
			await recordCheckout(event, event.data.object);
			break;
		case 'account.updated': {
			const account = event.data.object;
			await db
				.update(paymentSettings)
				.set({ stripeChargesEnabled: account.charges_enabled })
				.where(eq(paymentSettings.stripeAccountId, account.id));
			break;
		}
	}
}
