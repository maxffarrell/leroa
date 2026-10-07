import { command } from '$app/server';
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { requireOrg } from '#lib/server/context.ts';
import { hasFeature } from '#lib/server/ee/license.ts';
import { idSchema } from '#lib/schemas.ts';
import * as ai from '#lib/server/ai/index.ts';

/** Enterprise-only: AI draft/triage helpers (works keyless via local heuristics). */
async function requireEnterprise() {
	if (!hasFeature('ai')) error(403, 'AI features are part of the enterprise tier');
	return requireOrg('member');
}

export const aiTriageTicket = command(
	v.object({
		title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
		description: v.optional(v.nullable(v.string()), null),
		propertyName: v.optional(v.nullable(v.string()), null),
		unitName: v.optional(v.nullable(v.string()), null)
	}),
	async (input) => {
		const ctx = await requireEnterprise();
		return ai.triageTicket(ctx.orgId, input);
	}
);

export const aiDraftReply = command(idSchema, async (tenantId) => {
	const ctx = await requireEnterprise();
	return ai.draftReply(ctx.orgId, tenantId);
});

export const aiListingCopy = command(idSchema, async (listingId) => {
	const ctx = await requireEnterprise();
	return ai.listingCopy(ctx.orgId, listingId);
});
