import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { LEROA_CLOUD } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { lease, leaseTenant, property, tenant, unit } from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import { appOrigin } from '#lib/server/email.ts';
import { getProvider, providers, type PaymentProvider } from '#lib/server/payments/index.ts';
import { providerRow, providerRows, upsertProvider } from '#lib/server/payments/settings.ts';
import { getLease } from './leasing.ts';

function provider(id: string) {
	const p = getProvider(id);
	if (!p) error(404, 'Unknown payment provider');
	return p;
}

/** Providers each workspace currently offers to tenants. */
export async function payableProviders(orgIds: string[]) {
	const out = new Map<string, PaymentProvider[]>();
	for (const row of await providerRows(orgIds)) {
		const p = getProvider(row.provider);
		if (!p || !row.enabled || !p.ready(row)) continue;
		out.set(row.organizationId, [...(out.get(row.organizationId) ?? []), p]);
	}
	for (const list of out.values()) list.sort((a, b) => providers.indexOf(a) - providers.indexOf(b));
	return out;
}

export async function paymentSettingsView(orgId: string) {
	const rows = await providerRows([orgId]);
	return {
		requiresConnect: LEROA_CLOUD,
		providers: await Promise.all(
			providers.map(async (p) => {
				let row = rows.find((r) => r.provider === p.id) ?? null;
				if (row?.accountId && p.account && p.configured()) {
					const accountId = row.accountId;
					const ready = await p.account
						.refresh({ ...row, accountId })
						.catch(() => row!.accountReady);
					if (ready !== row.accountReady) {
						await upsertProvider(orgId, p.id, { accountReady: ready });
						row = { ...row, accountReady: ready };
					}
				}
				return {
					id: p.id,
					name: p.name,
					description: p.description,
					env: p.env,
					webhookEvents: p.webhookEvents,
					webhookNote: p.webhookNote ?? null,
					webhookUrl: `${appOrigin()}/api/payments/${p.id}/webhook`,
					configured: p.configured(),
					connectable: !!p.account,
					enabled: row?.enabled ?? false,
					ready: p.ready(row),
					hint: p.setupHint(row),
					account: row?.accountId ? { id: row.accountId, ready: row.accountReady } : null
				};
			})
		)
	};
}

export async function setProviderEnabled(ctx: OrgContext, id: string, enabled: boolean) {
	const p = provider(id);
	if (enabled) {
		if (!p.configured()) error(400, `${p.name} is not set up on this server`);
		const row = await providerRow(ctx.orgId, p.id);
		if (!p.ready(row)) error(400, p.setupHint(row) ?? `${p.name} isn't ready yet`);
	}
	await upsertProvider(ctx.orgId, p.id, { enabled });
}

/** Starts (or resumes) account onboarding with the provider and returns its hosted URL. */
export async function connectProvider(ctx: OrgContext, id: string) {
	const p = provider(id);
	if (!p.account) error(400, `${p.name} doesn't use connected accounts`);
	if (!p.configured()) error(400, `${p.name} is not set up on this server`);
	return p.account.connect(ctx, await providerRow(ctx.orgId, p.id));
}

export async function disconnectProvider(ctx: OrgContext, id: string) {
	const p = provider(id);
	await upsertProvider(ctx.orgId, p.id, { accountId: null, accountReady: false, enabled: false });
}

/** Starts provider-hosted checkout for a tenant's current balance. */
export async function createCheckout(userId: string, leaseId: string, providerId: string) {
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

	const p = getProvider(providerId);
	const settings = p ? await providerRow(row.orgId, p.id) : null;
	if (!p || !settings?.enabled || !p.ready(settings) || !p.supportsCurrency(row.currency))
		error(400, 'This payment option is not available for this home');

	const { balance } = await getLease(row.orgId, leaseId);
	if (balance <= 0) error(400, 'Nothing is due right now');

	const url = await p.checkout({
		orgId: row.orgId,
		leaseId,
		tenantId: row.tenantId,
		email: row.email,
		amount: balance,
		currency: row.currency,
		description: `Rent · ${row.propertyName} · ${row.unitName}`,
		row: settings
	});
	return { url, newTab: !!p.newTab };
}
