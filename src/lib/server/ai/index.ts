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

// ---------- Paid-tier extras: summarize, classify, suggest, digest ----------

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { lead, lease, maintenanceTicket, payment, unit, vendor } from '#lib/server/db/schema.ts';
import { getTenant } from '#lib/server/services/portfolio.ts';
import { getLease, outer, tenantNames } from '#lib/server/services/leasing.ts';
import { runReport } from '#lib/server/services/reports.ts';
import type { ReportKey, ReportParams } from '#lib/reports.ts';
import {
	heuristicDigest,
	heuristicReportSummary,
	heuristicTenantSummary,
	heuristicVendorPick,
	type AiSummary
} from '#lib/ai/heuristics.ts';

const summarySchema = v.object({
	summary: v.string(),
	flags: v.array(v.string())
});

async function chatSummary(system: string, user: string): Promise<AiSummary | null> {
	return chatJson(system, user, (raw) => vsafe(summarySchema, raw));
}

/** One-paragraph overview + flags for a tenant page. */
export async function tenantSummary(orgId: string, tenantId: string): Promise<AiSummary> {
	const t = await getTenant(orgId, tenantId);
	const name =
		[t.firstName, t.lastName].filter(Boolean).join(' ') || t.companyName || 'this tenant';
	const leaseRows = await Promise.all(
		t.leases.slice(0, 3).map(async (l) => {
			const full = await getLease(orgId, l.id);
			const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
			return {
				status: l.status,
				propertyName: l.propertyName,
				unitName: l.unitName,
				endDate: l.endDate ?? 'open-ended',
				balance: full.balance,
				rentAmount: l.rentAmount,
				currency: l.currency,
				paymentsLast12m: full.payments.filter((p) => p.receivedOn >= yearAgo).length,
				openTickets: t.tickets.filter((x) => x.status !== 'done' && x.status !== 'cancelled').length
			};
		})
	);
	const facts = {
		name,
		leases: leaseRows,
		ticketCount: t.tickets.length,
		openTickets: t.tickets.filter((x) => x.status !== 'done' && x.status !== 'cancelled').length,
		paymentsLast12m: leaseRows.reduce((s, l) => s + l.paymentsLast12m, 0)
	};
	const ai = await chatSummary(
		`You summarize a tenant's account for their property manager in 2-3 plain sentences, then list anything needing attention in "flags" (empty if none): unpaid balance, lease ending within 90 days with no renewal, many open maintenance requests. Neutral tone, no advice on screening or pricing.`,
		JSON.stringify(facts)
	);
	return ai ?? heuristicTenantSummary(facts);
}

/** Narrative + anomalies for a report. */
export async function reportSummary(
	orgId: string,
	key: ReportKey,
	params: ReportParams
): Promise<AiSummary> {
	const report = await runReport(orgId, key, params);
	const facts = {
		title: report.title,
		subtitle: report.subtitle,
		columns: report.columns,
		totals: report.totals,
		rows: report.rows.slice(0, 60),
		rowCount: report.rows.length
	};
	const ai = await chatSummary(
		`You summarize a property-management report for the manager in 1-2 sentences using the totals, then list the 0-4 most useful things to look at in "flags" (e.g. worst offender, surprising gaps). Money values are in cents. Be concrete: names and numbers, not generalities.`,
		JSON.stringify(facts)
	);
	return (
		ai ??
		heuristicReportSummary({
			title: report.title,
			subtitle: report.subtitle,
			columns: report.columns,
			rows: report.rows,
			totals: report.totals
		})
	);
}

/** Picks the best vendor for a ticket from trades, job history and COI status. */
export async function suggestVendor(
	orgId: string,
	ticketId: string
): Promise<{ vendorId: string; vendorName: string; reason: string } | null> {
	const [t] = await db
		.select({ title: maintenanceTicket.title, description: maintenanceTicket.description })
		.from(maintenanceTicket)
		.where(and(eq(maintenanceTicket.organizationId, orgId), eq(maintenanceTicket.id, ticketId)));
	if (!t) return null;
	const vendors = await listVendors(orgId);
	if (!vendors.length) return null;
	const stats = await db
		.select({
			vendorId: maintenanceTicket.vendorId,
			jobs: sql<number>`count(*)`.mapWith(Number),
			completed: sql<number>`count(*) filter (where ${maintenanceTicket.status} = 'done')`.mapWith(
				Number
			),
			avgCost: sql<number | null>`avg(${maintenanceTicket.costAmount})`.mapWith((v) =>
				v == null ? null : Number(v)
			)
		})
		.from(maintenanceTicket)
		.where(
			and(
				eq(maintenanceTicket.organizationId, orgId),
				sql`${maintenanceTicket.vendorId} is not null`
			)
		)
		.groupBy(maintenanceTicket.vendorId);
	const stat = new Map(stats.map((s) => [s.vendorId, s]));
	const candidates = vendors.map((v) => ({
		id: v.id,
		name: v.name,
		trades: v.trades,
		jobsCompleted: stat.get(v.id)?.completed ?? 0,
		avgCost: stat.get(v.id)?.avgCost ?? null,
		insuranceExpiresOn: v.insuranceExpiresOn
	}));
	const { trade } = heuristicTriage({ title: t.title, description: t.description });
	const shortlist = candidates.slice(0, 10);
	const ai = await chatJson(
		`You pick the best vendor for a maintenance ticket. Prefer vendors whose trades match the work, with insurance not expired, then more completed jobs, then lower average cost. Return {"vendorId": "<id>", "reason": "<one sentence>"} — vendorId must be one of the given ids, or {"vendorId": null} if none fit.`,
		JSON.stringify({ ticket: t, inferredTrade: trade, vendors: shortlist }),
		(raw) => {
			const r = v.safeParse(
				v.object({ vendorId: v.nullable(v.string()), reason: v.string() }),
				raw
			);
			if (!r.success || !r.output.vendorId) return null;
			const found = candidates.find((c) => c.id === r.output.vendorId);
			return found ? { vendorId: found.id, vendorName: found.name, reason: r.output.reason } : null;
		}
	);
	if (ai) return ai;
	const pick = heuristicVendorPick({ vendors: candidates, trade });
	if (!pick) return null;
	const v0 = candidates.find((c) => c.id === pick.vendorId)!;
	return { vendorId: v0.id, vendorName: v0.name, reason: pick.reason };
}

export type DigestFacts = {
	orgName: string;
	paymentsCount: number;
	paymentsTotal: number;
	currency: string | null;
	newTickets: { number: number; title: string; priority: string }[];
	closedTickets: number;
	expiringLeases: { tenant: string; unit: string; endDate: string }[];
	expiringCois: { vendor: string; expiresOn: string }[];
	newLeads: number;
};

/** Yesterday's activity + upcoming deadlines, for the daily digest email. */
export async function digestFacts(orgId: string, orgName: string): Promise<DigestFacts> {
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
	const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
	const today = new Date().toISOString().slice(0, 10);

	const [pay] = await db
		.select({
			n: sql<number>`count(*)`.mapWith(Number),
			total: sql<number>`coalesce(sum(${payment.amount}), 0)`.mapWith(Number)
		})
		.from(payment)
		.where(and(eq(payment.organizationId, orgId), gte(payment.createdAt, since)));
	const currencies = await db
		.select({ c: lease.currency })
		.from(lease)
		.where(eq(lease.organizationId, orgId))
		.limit(2);

	const newTickets = await db
		.select({
			number: maintenanceTicket.number,
			title: maintenanceTicket.title,
			priority: maintenanceTicket.priority
		})
		.from(maintenanceTicket)
		.where(
			and(eq(maintenanceTicket.organizationId, orgId), gte(maintenanceTicket.createdAt, since))
		)
		.orderBy(desc(maintenanceTicket.createdAt))
		.limit(10);
	const [closed] = await db
		.select({ n: sql<number>`count(*)`.mapWith(Number) })
		.from(maintenanceTicket)
		.where(
			and(eq(maintenanceTicket.organizationId, orgId), gte(maintenanceTicket.closedAt, since))
		);

	const expiringLeases = await db
		.select({
			endDate: lease.endDate,
			unitName: unit.name,
			tenant: tenantNames
		})
		.from(lease)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.where(
			and(
				eq(lease.organizationId, orgId),
				eq(lease.status, 'active'),
				gte(lease.endDate, today),
				sql`${lease.endDate} <= ${in30}`,
				sql`not exists (select 1 from ${lease} r where r.renewed_from_id = ${outer(lease.id)} and r.status <> 'terminated')`
			)
		)
		.limit(10);

	const expiringCois = await db
		.select({ name: vendor.name, expiresOn: vendor.insuranceExpiresOn })
		.from(vendor)
		.where(
			and(
				eq(vendor.organizationId, orgId),
				gte(vendor.insuranceExpiresOn, today),
				sql`${vendor.insuranceExpiresOn} <= ${in30}`
			)
		)
		.limit(10);

	const [newLeads] = await db
		.select({ n: sql<number>`count(*)`.mapWith(Number) })
		.from(lead)
		.where(and(eq(lead.organizationId, orgId), gte(lead.createdAt, since)));

	return {
		orgName,
		paymentsCount: pay?.n ?? 0,
		paymentsTotal: pay?.total ?? 0,
		currency: currencies.length === 1 ? (currencies[0]?.c ?? null) : null,
		newTickets,
		closedTickets: closed?.n ?? 0,
		expiringLeases: expiringLeases.map((l) => ({
			tenant: l.tenant,
			unit: l.unitName,
			endDate: l.endDate ?? ''
		})),
		expiringCois: expiringCois.map((c) => ({ vendor: c.name, expiresOn: c.expiresOn ?? '' })),
		newLeads: newLeads?.n ?? 0
	};
}

/** Turns digest facts into subject + intro + bullet lines (LLM or heuristic). */
export async function digestEmail(
	facts: DigestFacts
): Promise<{ subject: string; intro: string; lines: string[] }> {
	const fallback = heuristicDigest(facts);
	const ai = await chatJson(
		`You write a property manager's morning digest email. Given today's facts, return {"subject","intro","lines"}: a short subject, one intro sentence, and up to 8 bullet lines — each one sentence with the concrete numbers/names. No exclamation marks.`,
		JSON.stringify(facts),
		(raw) =>
			vsafe(v.object({ subject: v.string(), intro: v.string(), lines: v.array(v.string()) }), raw)
	);
	return ai ?? fallback;
}
