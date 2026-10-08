/**
 * AI features for the enterprise tier. Each feature calls the configured
 * OpenAI-compatible provider and falls back to a deterministic local heuristic
 * when AI_API_KEY is unset, so everything works (and is demoable) keyless.
 */
import * as v from 'valibot';
import { chatJson, chatText } from './client.ts';
import {
	heuristicInsights,
	heuristicLeaseExtract,
	heuristicListingCopy,
	heuristicReply,
	heuristicTriage
} from '#lib/ai/heuristics.ts';
import { getListing } from '#lib/server/services/listings.ts';
import { dashboard } from '#lib/server/services/dashboard.ts';
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

const leaseExtractSchema = v.object({
	tenants: v.pipe(v.array(v.string()), v.maxLength(8)),
	startDate: v.nullable(v.string()),
	endDate: v.nullable(v.string()),
	rentAmount: v.nullable(v.number()),
	depositAmount: v.nullable(v.number())
});

/** Extracts lease fields from PDF text — tenants, term dates, rent, deposit. */
export async function extractLeaseFields(text: string) {
	const ai = await chatJson(
		`You extract fields from a residential lease for a property manager. Output {"tenants": ["Full Name"], "startDate": "YYYY-MM-DD"|null, "endDate": "YYYY-MM-DD"|null, "rentAmount": monthly rent in CENTS|null, "depositAmount": security deposit in CENTS|null}. Tenants are the renters/lessees, never the landlord or manager. Dates ISO format only. No guessing.`,
		text.slice(0, 60_000),
		(raw) => vsafe(leaseExtractSchema, raw)
	);
	return ai ?? heuristicLeaseExtract(text);
}

const csvMapSchema = v.object({ mapping: v.record(v.string(), v.nullable(v.string())) });

/**
 * Maps CSV headers onto import field keys. Only fills keys the caller couldn't
 * map with its own alias table — those stay authoritative.
 */
export async function mapCsvColumns(input: {
	headers: string[];
	fields: { key: string; label: string }[];
	unmapped: string[];
}): Promise<Record<string, number | null>> {
	const ai = await chatJson(
		`You map spreadsheet column headers to import fields for a property manager. Output {"mapping": {"<fieldKey>": "<exact header string>"|null}}. Only map when a header clearly means the field; use null when unsure.`,
		JSON.stringify({
			headers: input.headers,
			fields: input.fields.filter((f) => input.unmapped.includes(f.key))
		}),
		(raw) => vsafe(csvMapSchema, raw)
	);
	const out: Record<string, number | null> = {};
	const lower = input.headers.map((h) => h.trim().toLowerCase());
	for (const key of input.unmapped) {
		const header = ai?.mapping[key];
		out[key] =
			header == null
				? null
				: (() => {
						const i = lower.indexOf(header.trim().toLowerCase());
						return i >= 0 ? i : null;
					})();
	}
	return out;
}

const insightSchema = v.object({
	insights: v.pipe(
		v.array(v.object({ title: v.string(), body: v.string(), href: v.string() })),
		v.maxLength(4)
	)
});

const INSIGHT_HREFS = new Set([
	'/rent',
	'/leases',
	'/maintenance',
	'/vendors',
	'/leasing',
	'/properties',
	'/tenants',
	'/messages',
	'/documents',
	'/residents'
]);

/** Plain-language "what needs attention" cards for the dashboard. */
export async function insights(orgId: string) {
	const d = await dashboard(orgId);
	const facts = {
		overdueCount: d.rent.overdue.length,
		overdueAmount: d.rent.overdue.reduce((s, r) => s + Math.max(0, r.amount - r.paid), 0),
		collectedPct: d.rent.due > 0 ? Math.round((d.rent.collected / d.rent.due) * 100) : 100,
		expiringLeases: d.expiringLeases,
		soonestExpiryDays: d.nextLeaseExpiryDays,
		openTickets: d.openTickets.length,
		urgentTickets: d.urgentTickets,
		expiringVendorInsurance: d.insuranceAlerts.length,
		vacantUnits: d.occupancy.vacant,
		leadsNeedingAttention: d.followUps.length,
		openTurns: d.openTurns
	};
	const ai = await chatJson(
		`You are a property manager's analyst. Given workspace facts, output {"insights": [{"title","body","href"}]} — at most 4 cards, most urgent first, only when something genuinely needs attention. title is a short headline (≤8 words), body one sentence of plain advice, href one of the listed app routes. No pep talk, no generic praise.`,
		JSON.stringify({ facts, routes: [...INSIGHT_HREFS] }),
		(raw) => vsafe(insightSchema, raw)
	);
	if (ai) return ai.insights.filter((i) => INSIGHT_HREFS.has(i.href)).slice(0, 4);
	return heuristicInsights(facts);
}
