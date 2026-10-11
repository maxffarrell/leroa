/**
 * Snap decisions for the enterprise tier — one fast classification call that
 * routes, flags and prioritizes incoming work. Each feature falls back to a
 * deterministic local heuristic when AI_API_KEY is unset.
 *
 * Deliberately imports no services so any service can call these without
 * creating import cycles.
 */
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import { charge, lease, maintenanceTicket, payment } from '#lib/server/db/schema.ts';
import { chatJson } from './client.ts';
import {
	heuristicDelinquency,
	heuristicIntake,
	heuristicLeadScore,
	heuristicMessageClass,
	type Delinquency,
	type IntakeDecision,
	type LeadScore,
	type MessageClass
} from '#lib/ai/heuristics.ts';

function vsafe<S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<S> | null {
	const r = v.safeParse(schema, value);
	return r.success ? r.output : null;
}

const OPEN_STATUSES = ['open', 'in_progress', 'on_hold'] as const;
const DUP_WINDOW_DAYS = 120;

async function dupCandidates(orgId: string, unitId: string | null, propertyId: string | null) {
	if (!unitId && !propertyId) return [];
	return db
		.select({
			id: maintenanceTicket.id,
			title: maintenanceTicket.title,
			description: maintenanceTicket.description
		})
		.from(maintenanceTicket)
		.where(
			and(
				eq(maintenanceTicket.organizationId, orgId),
				inArray(maintenanceTicket.status, [...OPEN_STATUSES]),
				unitId
					? eq(maintenanceTicket.unitId, unitId)
					: eq(maintenanceTicket.propertyId, propertyId!),
				gte(maintenanceTicket.createdAt, new Date(Date.now() - DUP_WINDOW_DAYS * 86400_000))
			)
		)
		.orderBy(desc(maintenanceTicket.createdAt))
		.limit(15);
}

const intakeSchema = v.object({
	emergency: v.boolean(),
	reason: v.nullable(v.string()),
	duplicateId: v.nullable(v.string()),
	duplicateReason: v.nullable(v.string())
});

/**
 * Decides two things about an incoming request: is it an emergency, and does it
 * repeat an open request at the same home? Runs before the ticket is inserted so
 * the row can be written already-escalated and cross-linked.
 */
export async function intakeTicket(
	orgId: string,
	input: {
		title: string;
		description?: string | null;
		unitId?: string | null;
		propertyId?: string | null;
	}
): Promise<IntakeDecision> {
	const candidates = await dupCandidates(orgId, input.unitId ?? null, input.propertyId ?? null);
	const parsed = await chatJson(
		`You decide on an incoming maintenance request for a property manager — fast, two calls. "emergency": true only for immediate safety or active-damage risk (gas, fire, flooding, no heat or water, break-in, sparking). "duplicateId": the id of one of the open requests below when this clearly reports the same issue, else null. Give a one-clause reason for each decision you make, null otherwise.`,
		JSON.stringify({
			title: input.title,
			description: input.description ?? null,
			openRequests: candidates
		}),
		(raw) => vsafe(intakeSchema, raw)
	);
	if (!parsed)
		return heuristicIntake({
			title: input.title,
			description: input.description,
			candidates
		});
	const duplicateOf =
		parsed.duplicateId && candidates.some((c) => c.id === parsed.duplicateId)
			? parsed.duplicateId
			: null;
	return {
		emergency: parsed.emergency,
		reason: parsed.emergency
			? (parsed.reason ?? 'Reads like an emergency — respond immediately.')
			: null,
		duplicateOf,
		duplicateReason: duplicateOf
			? (parsed.duplicateReason ?? 'Similar to an open request at the same home.')
			: null
	};
}

const leadScoreSchema = v.object({
	score: v.picklist(['hot', 'warm', 'cold']),
	reason: v.string()
});

/** Scores a new lead hot/warm/cold so agents know who to call first. */
export async function scoreLead(
	orgId: string,
	input: {
		email?: string | null;
		phone?: string | null;
		moveInDate?: string | null;
		bedrooms?: number | null;
		budgetMax?: number | null;
		propertyName?: string | null;
		listingTitle?: string | null;
		source: string;
		message?: string | null;
	}
): Promise<LeadScore> {
	void orgId;
	const parsed = await chatJson(
		`You score leasing inquiries for a property manager. "hot" = likely to lease soon: reachable, near-term move-in, named a home, already applied, or wrote with urgency. "warm" = a couple of those signals. "cold" = thin or vague. Judge sales-readiness only — never demographics, family status, or anything about who the person is. "reason" is one short clause an agent can act on.`,
		JSON.stringify({
			source: input.source,
			hasEmail: !!input.email,
			hasPhone: !!input.phone,
			moveInDate: input.moveInDate ?? null,
			bedrooms: input.bedrooms ?? null,
			budgetMaxCents: input.budgetMax ?? null,
			home: input.listingTitle ?? input.propertyName ?? null,
			message: input.message?.slice(0, 600) ?? null
		}),
		(raw) => vsafe(leadScoreSchema, raw)
	);
	return parsed ?? heuristicLeadScore(input);
}

const messageSchema = v.object({
	category: v.picklist(['maintenance', 'payment', 'lease', 'other']),
	urgent: v.boolean()
});

/** Routes a tenant's portal message and flags emergencies for faster handling. */
export async function classifyMessage(body: string): Promise<MessageClass> {
	const parsed = await chatJson(
		`You classify a tenant's message to their property manager. Categories: maintenance (repairs or problems with the home), payment (rent, charges, deposits), lease (renewals, move-outs, roommates, pets, parking, keys), other. "urgent" is true only for immediate safety or active-damage emergencies, not mere unhappiness.`,
		JSON.stringify({ body: body.slice(0, 2000) }),
		(raw) => vsafe(messageSchema, raw)
	);
	return parsed ?? heuristicMessageClass(body);
}

type LeaseFacts = {
	leaseId: string;
	balanceCents: number;
	monthlyRentCents: number;
	lateCount6m: number;
	dueCount6m: number;
	lastPaymentAt: string | null;
};

const watchSchema = v.array(
	v.object({ leaseId: v.string(), watch: v.boolean(), reason: v.string() })
);

/**
 * Flags active leases whose payment pattern is drifting — a "watch" flag with a
 * plain reason, not a decision. Only payment history and balances are fed in;
 * nothing about the tenant themselves.
 */
export async function delinquencyWatch(
	orgId: string
): Promise<{ leaseId: string; reason: string }[]> {
	const lid = sql.raw('"lease"."id"');
	const rows = await db
		.select({
			leaseId: lease.id,
			// ${lease.id} renders as bare "id" inside these correlated subqueries —
			// ambiguous against charge.id/payment.id. Qualify the lease id literally.
			balanceCents:
				sql<number>`coalesce((select sum(c.amount) from ${charge} c where c.lease_id = ${lid} and c.due_date <= current_date), 0)
					- coalesce((select sum(p.amount) from ${payment} p where p.lease_id = ${lid}), 0)`.mapWith(Number),
			monthlyRentCents:
				sql<number>`coalesce((select c.amount from ${charge} c where c.lease_id = ${lid} and c.kind = 'rent' order by c.due_date desc limit 1), 0)`.mapWith(
					Number
				),
			lateCount6m:
				sql<number>`(select count(*) from ${payment} p join ${charge} c on c.id = p.charge_id where p.lease_id = ${lid} and c.due_date >= current_date - 180 and p.created_at::date > c.due_date + 7)`.mapWith(
					Number
				),
			dueCount6m:
				sql<number>`(select count(*) from ${charge} c where c.lease_id = ${lid} and c.due_date >= current_date - 180)`.mapWith(
					Number
				),
			lastPaymentAt: sql<
				string | null
			>`(select max(p.created_at)::text from ${payment} p where p.lease_id = ${lid})`
		})
		.from(lease)
		.where(and(eq(lease.organizationId, orgId), eq(lease.status, 'active')));

	const facts: LeaseFacts[] = rows
		.map((r) => ({
			leaseId: r.leaseId,
			balanceCents: r.balanceCents,
			monthlyRentCents: r.monthlyRentCents,
			lateCount6m: r.lateCount6m,
			dueCount6m: r.dueCount6m,
			lastPaymentAt: r.lastPaymentAt?.slice(0, 10) ?? null
		}))
		.filter((f) => f.balanceCents > 0 || f.lateCount6m > 0);
	if (!facts.length) return [];

	const parsed = await chatJson(
		`You flag leases a property manager should watch for late payment, from payment facts only. "watch": true when the pattern is deteriorating — a growing balance, repeated lates, or long silence with money owed. A small current balance with an otherwise on-time history is not a watch. "reason" is one short clause. Judge payment history only.`,
		JSON.stringify({ leases: facts }),
		(raw) => vsafe(watchSchema, raw)
	);
	if (!parsed)
		return facts
			.map((f) => ({ leaseId: f.leaseId, ...heuristicDelinquency(f) }))
			.filter((d) => d.watch)
			.map((d) => ({ leaseId: d.leaseId, reason: d.reason }));
	const ids = new Set(facts.map((f) => f.leaseId));
	return parsed
		.filter((d) => d.watch && ids.has(d.leaseId))
		.map((d) => ({ leaseId: d.leaseId, reason: d.reason || 'Payment pattern looks shaky.' }));
}

export type { Delinquency, IntakeDecision, LeadScore, MessageClass };
