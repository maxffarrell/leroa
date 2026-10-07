/**
 * AI features for the enterprise tier. Each feature calls the configured
 * OpenAI-compatible provider and falls back to a deterministic local heuristic
 * when AI_API_KEY is unset, so everything works (and is demoable) keyless.
 */
import * as v from 'valibot';
import { chatJson, chatText } from './client.ts';
import { heuristicListingCopy, heuristicReply, heuristicTriage } from '#lib/ai/heuristics.ts';
import { getListing } from '#lib/server/services/listings.ts';
import { getThread } from '#lib/server/services/messaging.ts';
import { listVendors } from '#lib/server/services/vendors.ts';

const triageSchema = v.object({
	priority: v.picklist(['low', 'normal', 'high', 'urgent']),
	trade: v.nullable(v.string()),
	reason: v.string()
});

export async function triageTicket(
	orgId: string,
	input: {
		title: string;
		description?: string | null;
		propertyName?: string | null;
		unitName?: string | null;
	}
) {
	const trades = [...new Set((await listVendors(orgId)).flatMap((v) => v.trades))];
	const parsed = await chatJson(
		`You triage maintenance requests for a property manager. Pick a priority and, if the problem clearly fits, a vendor trade. Priority guide: urgent = emergency/safety/active damage; high = affects habitability today; low = cosmetic; normal = routine. "reason" is one short sentence a PM can act on.`,
		JSON.stringify({
			title: input.title,
			description: input.description ?? null,
			property: input.propertyName ?? null,
			unit: input.unitName ?? null,
			availableTrades: trades
		}),
		(raw) => vsafe(triageSchema, raw)
	);
	return parsed ?? heuristicTriage({ ...input, trades });
}

export async function draftReply(orgId: string, tenantId: string): Promise<string> {
	const thread = await getThread(orgId, tenantId);
	const last = thread.messages.slice(-10);
	const ai = await chatText(
		`You are a property manager replying to a resident named ${thread.tenant.name} (${[thread.tenant.propertyName, thread.tenant.unitName].filter(Boolean).join(' · ') || 'no home on file'}). Write a short, helpful reply in your own voice — no subject line, no sign-off. Acknowledge their last message and either answer it or say what happens next. Never promise legal or financial outcomes.`,
		last
			.map((m) => `${m.authorType === 'staff' ? 'Manager' : thread.tenant.name}: ${m.body}`)
			.join('\n') || '(no messages yet)'
	);
	return (
		ai ??
		heuristicReply({
			tenantName: thread.tenant.name,
			unitName: thread.tenant.unitName,
			lastMessages: last.map((m) => ({
				authorType: m.authorType as 'staff' | 'tenant',
				body: m.body
			}))
		})
	);
}

export async function listingCopy(orgId: string, listingId: string) {
	const l = await getListing(orgId, listingId);
	const facts = {
		property: l.propertyName,
		unit: l.unitName,
		bedrooms: l.bedrooms,
		bathrooms: l.bathrooms,
		areaSqft: l.areaSqft,
		city: l.city,
		rentAmount: l.rentAmount,
		currency: l.currency,
		availableOn: l.availableOn,
		leaseTermMonths: l.leaseTermMonths,
		petPolicy: l.petPolicy,
		amenities: l.amenities
	};
	const ai = await chatJson(
		`You write rental-listing copy for a property manager. Fair-housing rules: describe the HOME only — never who should live there, no familial status, disability, race, religion, sex, national origin, or "perfect for" phrasing. Output {"title": "...", "description": "..."} where title is under 80 chars and description is 2-4 short paragraphs.`,
		JSON.stringify(facts),
		(raw) => vsafe(v.object({ title: v.string(), description: v.string() }), raw)
	);
	return (
		ai ??
		heuristicListingCopy({
			propertyName: l.propertyName,
			unitName: l.unitName,
			bedrooms: l.bedrooms,
			bathrooms: l.bathrooms,
			rentAmount: l.rentAmount,
			amenities: l.amenities,
			availableOn: l.availableOn
		})
	);
}

function vsafe<S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<S> | null {
	const r = v.safeParse(schema, value);
	return r.success ? r.output : null;
}
