import * as v from 'valibot';
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import { db } from '#lib/server/db/index.ts';
import { integrationInstall, member, user, webhook } from '#lib/server/db/schema.ts';
import { dashboard } from '#lib/server/services/dashboard.ts';
import { search } from '#lib/server/services/search.ts';
import { loadDemoData } from '#lib/server/services/demo.ts';
import { property } from '#lib/server/db/schema.ts';
import { getIntegration, listIntegrations } from '#lib/server/integrations/runtime.ts';
import { idSchema, webhookInput } from '#lib/schemas.ts';

export const getDashboard = query(async () => dashboard((await requireOrg()).orgId));
export const searchAll = query(v.pipe(v.string(), v.maxLength(100)), async (q) =>
	search((await requireOrg()).orgId, q)
);

export const getMembers = query(async () => {
	const { orgId } = await requireOrg();
	return db
		.select({
			id: member.id,
			userId: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			role: member.role,
			createdAt: member.createdAt
		})
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, orgId))
		.orderBy(asc(member.createdAt));
});

export const getWebhooks = query(async () => {
	const { orgId } = await requireOrg('admin');
	return db
		.select()
		.from(webhook)
		.where(eq(webhook.organizationId, orgId))
		.orderBy(desc(webhook.createdAt));
});
export const createWebhook = command(webhookInput, async (input) => {
	const { orgId } = await requireOrg('admin');
	const [w] = await db
		.insert(webhook)
		.values({
			organizationId: orgId,
			url: input.url,
			events: input.events,
			secret: `whsec_${randomBytes(24).toString('base64url')}`
		})
		.returning();
	void getWebhooks().refresh();
	return w!;
});
export const toggleWebhook = command(
	v.object({ id: idSchema, enabled: v.boolean() }),
	async ({ id, enabled }) => {
		const { orgId } = await requireOrg('admin');
		await db
			.update(webhook)
			.set({ enabled })
			.where(and(eq(webhook.organizationId, orgId), eq(webhook.id, id)));
		void getWebhooks().refresh();
	}
);
export const deleteWebhook = command(idSchema, async (id) => {
	const { orgId } = await requireOrg('admin');
	await db.delete(webhook).where(and(eq(webhook.organizationId, orgId), eq(webhook.id, id)));
	void getWebhooks().refresh();
});

export const getIntegrations = query(async () => {
	const { orgId } = await requireOrg();
	const installs = await db
		.select()
		.from(integrationInstall)
		.where(eq(integrationInstall.organizationId, orgId));
	return listIntegrations().map((m) => {
		const install = installs.find((i) => i.integrationId === m.id);
		return {
			...m,
			installed: !!install,
			enabled: install?.enabled ?? false,
			// Never send secret values back to the browser.
			values: Object.fromEntries(
				m.config.map((f) => [
					f.key,
					f.type === 'secret'
						? install?.config[f.key]
							? '••••••••'
							: ''
						: ((install?.config[f.key] as string | boolean | undefined) ?? '')
				])
			)
		};
	});
});
export const saveIntegration = command(
	v.object({
		id: v.string(),
		enabled: v.boolean(),
		config: v.record(v.string(), v.union([v.string(), v.boolean()]))
	}),
	async ({ id, enabled, config }) => {
		const { orgId } = await requireOrg('admin');
		const def = getIntegration(id);
		if (!def) error(404, 'Unknown integration');
		const [existing] = await db
			.select()
			.from(integrationInstall)
			.where(
				and(eq(integrationInstall.organizationId, orgId), eq(integrationInstall.integrationId, id))
			);
		const merged: Record<string, unknown> = { ...(existing?.config ?? {}) };
		for (const field of def.config) {
			const value = config[field.key];
			if (value === undefined || value === '••••••••') continue;
			merged[field.key] = value;
		}
		const missing = def.config.find((f) => 'required' in f && f.required && !merged[f.key]);
		if (enabled && missing) error(400, `${missing.label} is required`);
		await db
			.insert(integrationInstall)
			.values({ organizationId: orgId, integrationId: id, config: merged, enabled })
			.onConflictDoUpdate({
				target: [integrationInstall.organizationId, integrationInstall.integrationId],
				set: { config: merged, enabled }
			});
		void getIntegrations().refresh();
	}
);

export const seedDemo = command(async () => {
	const ctx = await requireOrg('admin');
	const [existing] = await db
		.select({ id: property.id })
		.from(property)
		.where(eq(property.organizationId, ctx.orgId))
		.limit(1);
	if (existing) error(409, 'Demo data can only be loaded into an empty workspace');
	const result = await loadDemoData(ctx);
	void getDashboard().refresh();
	return result;
});
