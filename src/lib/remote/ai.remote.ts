import { command, query } from '$app/server';
import * as v from 'valibot';
import { requireOrg } from '#lib/server/context.ts';
import { idSchema, reportParams } from '#lib/schemas.ts';
import * as ai from '#lib/server/ai/index.ts';
import { askAssistant } from '#lib/server/ai/assistant.ts';
import { delinquencyWatch } from '#lib/server/ai/decisions.ts';

export const aiTriageTicket = command(
	v.object({
		title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
		description: v.optional(v.nullable(v.string()), null),
		propertyName: v.optional(v.nullable(v.string()), null),
		unitName: v.optional(v.nullable(v.string()), null)
	}),
	async (input) => {
		const ctx = await requireOrg('member');
		return ai.triageTicket(ctx.orgId, input);
	}
);

export const aiDraftReply = command(idSchema, async (tenantId) => {
	const ctx = await requireOrg('member');
	return ai.draftReply(ctx.orgId, tenantId);
});

export const aiListingCopy = command(idSchema, async (listingId) => {
	const ctx = await requireOrg('member');
	return ai.listingCopy(ctx.orgId, listingId);
});

export const aiAsk = command(
	v.object({ question: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)) }),
	async ({ question }) => {
		const ctx = await requireOrg('member');
		return askAssistant(ctx.orgId, question);
	}
);

export const aiMapCsv = command(
	v.object({
		headers: v.pipe(v.array(v.string()), v.maxLength(100)),
		fields: v.pipe(v.array(v.object({ key: v.string(), label: v.string() })), v.maxLength(100)),
		unmapped: v.pipe(v.array(v.string()), v.maxLength(100))
	}),
	async (input) => {
		await requireOrg('member');
		return ai.mapCsvColumns(input);
	}
);

export const aiInsights = query(async () => {
	const ctx = await requireOrg('member');
	return ai.insights(ctx.orgId);
});

export const aiTenantSummary = query(idSchema, async (tenantId) => {
	const ctx = await requireOrg('member');
	return ai.tenantSummary(ctx.orgId, tenantId);
});

export const aiReportSummary = command(reportParams, async ({ key, ...params }) => {
	const ctx = await requireOrg('member');
	return ai.reportSummary(ctx.orgId, key, params);
});

export const aiSuggestVendor = command(idSchema, async (ticketId) => {
	const ctx = await requireOrg('member');
	return ai.suggestVendor(ctx.orgId, ticketId);
});

/** Leases whose payment pattern is drifting — a watch flag and a reason. */
export const aiDelinquencyWatch = query(async () => {
	const ctx = await requireOrg('member');
	return delinquencyWatch(ctx.orgId);
});
