import { assertEntityAccess, assertPortalDelegation } from '#lib/server/access.ts';
import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireUser, requireOrg } from '#lib/server/context.ts';
import {
	portalOverview,
	portalPreview,
	portalRequest,
	portalToken
} from '#lib/server/services/portal.ts';
import { db } from '#lib/server/db/index.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import { createCheckout } from '#lib/server/services/online-payments.ts';
import { idSchema } from '#lib/schemas.ts';
import { error } from '@sveltejs/kit';

export const getPortal = query(async () => portalOverview(requireUser().user.id));

/** Manager-side read-only preview of a tenant's portal. */
export const previewPortal = query(idSchema, async (tenantId) => {
	const ctx = await requireOrg();
	assertPortalDelegation(ctx);
	await assertEntityAccess(ctx, 'tenant', tenantId);
	const { orgId } = ctx;
	return portalPreview(orgId, tenantId);
});

export const submitRequest = command(
	v.object({
		leaseId: v.string(),
		title: v.pipe(v.string(), v.trim(), v.nonEmpty('Describe the issue'), v.maxLength(200)),
		description: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(5000))))
	}),
	async (input) => {
		const t = await portalRequest(requireUser().user.id, input);
		void getPortal().refresh();
		return t;
	}
);

/** Staff action: generate a portal invite link for a tenant. */
export const createPortalLink = command(v.string(), async (tenantId) => {
	const ctx = await requireOrg();
	assertPortalDelegation(ctx);
	await assertEntityAccess(ctx, 'tenant', tenantId, 'write');
	const { orgId } = ctx;
	const t = await db.query.tenant.findFirst({
		where: (t, { and, eq }) => and(eq(t.organizationId, orgId), eq(t.id, tenantId))
	});
	if (!t) error(404, 'Tenant not found');
	return { path: `/portal/claim/${portalToken(t.id)}` };
});

export const payOnline = command(
	v.object({ leaseId: idSchema, provider: v.pipe(v.string(), v.maxLength(32)) }),
	async ({ leaseId, provider }) => {
		assertNotDemo();
		return createCheckout(requireUser().user.id, leaseId, provider);
	}
);

export const respondSurvey = command(
	v.object({
		surveyId: idSchema,
		rating: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)))),
		comment: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(2000))))
	}),
	async (input) => {
		const { answerSurvey } = await import('#lib/server/services/residents.ts');
		const row = await answerSurvey(requireUser().user.id, input);
		void getPortal().refresh();
		return row;
	}
);
