import type { OrgContext } from '#lib/server/context.ts';
import { allows, type ApiResource } from '#lib/api-permissions.ts';
import { filterRecords } from '#lib/server/access.ts';
/**
 * Workspace assistant: answers questions grounded in live org data and drafts
 * work orders / tenant replies. Uses the configured provider when AI_API_KEY
 * is set, otherwise a deterministic intent router over the same context pack —
 * so the feature works (and is demoable) keyless.
 *
 * Fair housing: the assistant never advises on approving/denying applicants,
 * steering, or anything touching protected classes — it declines and points
 * at the application instead.
 */
import * as v from 'valibot';
import { chatJson, aiConfigured } from './client.ts';
import { draftReply } from './index.ts';
import { heuristicTriage } from '#lib/ai/heuristics.ts';
import { formatMoney } from '#lib/format.ts';
import { listProperties, listTenants, listUnits } from '#lib/server/services/portfolio.ts';
import { listLeases } from '#lib/server/services/leasing.ts';
import { listTickets } from '#lib/server/services/maintenance.ts';
import { listListings } from '#lib/server/services/listings.ts';
import { listVendors } from '#lib/server/services/vendors.ts';
import { listLeads } from '#lib/server/services/crm.ts';

export type AssistantAction =
	| {
			type: 'create_ticket';
			input: {
				propertyId: string;
				unitId: string | null;
				tenantId: string | null;
				title: string;
				description: string;
				priority: 'low' | 'normal' | 'high' | 'urgent';
			};
	  }
	| { type: 'draft_reply'; tenantId: string; tenantName: string; body: string };

export type AssistantAnswer = {
	reply: string;
	sources: { label: string; href: string }[];
	action: AssistantAction | null;
};

const actionSchema = v.union([
	v.object({
		type: v.literal('create_ticket'),
		input: v.object({
			propertyId: v.string(),
			unitId: v.nullable(v.string()),
			tenantId: v.nullable(v.string()),
			title: v.string(),
			description: v.string(),
			priority: v.picklist(['low', 'normal', 'high', 'urgent'])
		})
	}),
	v.object({
		type: v.literal('draft_reply'),
		tenantId: v.string(),
		tenantName: v.string(),
		body: v.string()
	})
]);

const answerSchema = v.object({
	reply: v.string(),
	sources: v.optional(
		v.array(v.object({ label: v.string(), href: v.pipe(v.string(), v.startsWith('/')) })),
		[]
	),
	action: v.optional(v.nullable(actionSchema), null)
});

async function loadPack(orgId: string, ctx?: OrgContext) {
	const permitted = (resource: ApiResource) => !ctx?.perms || allows(ctx.perms, resource, 'read');
	const rows = async <T>(resource: ApiResource, load: () => Promise<T[]>) =>
		permitted(resource) ? (ctx ? filterRecords(ctx, resource, await load()) : load()) : [];
	const [properties, units, leases, tickets, tenants, listings, vendors, leads] = await Promise.all(
		[
			rows('properties', () => listProperties(orgId)),
			rows('units', () => listUnits(orgId)),
			rows('leases', () => listLeases(orgId)),
			rows('tickets', () => listTickets(orgId)),
			rows('tenants', () => listTenants(orgId)),
			rows('listings', () => listListings(orgId)),
			rows('vendors', () => listVendors(orgId)),
			rows('leads', () => listLeads(orgId))
		]
	);
	return { properties, units, leases, tickets, tenants, listings, vendors, leads };
}

type Pack = Awaited<ReturnType<typeof loadPack>>;

export async function askAssistant(
	orgId: string,
	question: string,
	ctx?: OrgContext
): Promise<AssistantAnswer> {
	const pack = await loadPack(orgId, ctx);
	if (aiConfigured()) {
		const ai = await chatJson(
			`You are the assistant inside Leroa, a property-management workspace. Answer ONLY from the JSON data given — if the data doesn't cover it, say so briefly. Be terse: lead with the direct answer, then a compact list (one item per line, "- " bullets). Never advise on approving/denying applicants, steering, or protected classes — decline and offer to open the application instead. Return {"reply": "...", "sources": [{"label", "href"}]} with hrefs like /maintenance /leases /tenants. When asked to draft a work order add "action": {"type": "create_ticket", "input": {propertyId, unitId, tenantId, title, description, priority}} using real ids from the data. When asked to draft a message to a tenant add {"type": "draft_reply", tenantId, tenantName, body} — body is the short reply text only.`,
			JSON.stringify({ question, data: snapshot(pack) }),
			(raw) => vsafe(answerSchema, raw)
		);
		if (ai && ai.reply.trim()) return ai;
	}
	return heuristicAsk(orgId, pack, question, ctx);
}

function snapshot(pack: Pack) {
	return {
		units: pack.units.map((u) => ({
			id: u.id,
			name: u.name,
			property: u.propertyName,
			status: u.status,
			marketRent: u.marketRent
		})),
		leases: pack.leases.map((l) => ({
			id: l.id,
			unit: l.unitName,
			property: l.propertyName,
			status: l.status,
			end: l.endDate,
			rent: l.rentAmount,
			currency: l.currency,
			balance: l.balance,
			tenants: l.tenants
		})),
		tickets: pack.tickets.slice(0, 40).map((t) => ({
			number: t.number,
			title: t.title,
			status: t.status,
			priority: t.priority,
			property: t.propertyName,
			unit: t.unitName,
			vendor: t.vendorName,
			due: t.dueDate
		})),
		tenants: pack.tenants.map((t) => ({
			id: t.id,
			name: tenantName(t),
			unit: t.unitName,
			property: t.propertyName
		})),
		listings: pack.listings.map((l) => ({
			title: l.title,
			status: l.status,
			rent: l.rentAmount,
			availableOn: l.availableOn,
			unit: l.unitName,
			property: l.propertyName,
			newApplications: l.newApplications
		})),
		vendors: pack.vendors.map((vn) => ({ name: vn.name, trades: vn.trades })),
		leads: pack.leads.slice(0, 40).map((l) => ({
			name: `${l.firstName} ${l.lastName}`.trim(),
			stage: l.stage,
			property: l.propertyName,
			listing: l.listingTitle,
			waitlist: l.waitlist
		})),
		properties: pack.properties.map((p) => ({ id: p.id, name: p.name }))
	};
}

/* ---------- deterministic intent router ---------- */

// Screening stems are prefixes (no trailing \b) so 'approve', 'denied',
// 'screening', 'qualify' all match. Fires on explicit screening terms, or on
// a judgement verb aimed at an applicant-ish noun — never issues an opinion,
// always declines to the application.
export const SCREENING =
	/\b(approv\w*|deny\b|deni\w*|reject\w*|screen\w*|qualif\w*|should i rent|rent to|lease to|credit (check|score|history|report)|background check|evict\w*)/i;
const DRAFT_TICKET = /\b(work ?order|ticket|maintenance request)\b/i;
const DRAFT_MSG = /\b(message|reply|response|text|email|note)\b/i;
// 'open' stays out of DRAFT_VERB — 'open tickets?' is a question, not a
// command; it's allowed only in the explicit 'open a work order' phrasing.
const DRAFT_VERB = /\b(draft|create|make|log|file|start|add|new)\b/i;
const OPEN_TICKET = /\bopen (a |an |the |new )?(work ?order|ticket|maintenance request)\b/i;
const DRAFT_MSG_VERB = /\b(draft|write|send|reply|respond|message|text|email|compose)\b/i;
const VACANT = /\b(vacan|available|availab|unoccupied|empty|open unit|rentable)/i;
const EXPIRING = /\b(expir|renew|end(s|ing)? (this|next|soon)|coming up)/i;
const DELINQUENT =
	/\b(owe|delinquen|unpaid|outstanding|behind|balance|late (rent|payment)|missed)/i;
const TICKET_Q = /\b(ticket|work order|maintenance|repair|request)s?\b/i;
const WHO_IN = /\bwho (lives|is|resides|'s) (in|at)\b/i;
const LISTING_Q = /\b(listing|listed|advertis|publish|on the market)/i;
const VENDOR_Q = /\b(vendor|plumber|electrician|hvac|contractor|handyman|pest)/i;
const LEAD_Q = /\b(lead|applicant|application|prospect|waitlist|tour)/i;
const LEASE_OF = /\blease\b/i;

async function heuristicAsk(
	orgId: string,
	pack: Pack,
	question: string,
	ctx?: OrgContext
): Promise<AssistantAnswer> {
	const q = question.trim();
	const unit = findUnit(pack, q);
	const tenant = findTenant(pack, q);

	// Drafts first — they combine an intent verb with an entity.
	if ((DRAFT_VERB.test(q) || OPEN_TICKET.test(q)) && DRAFT_TICKET.test(q)) {
		const target = unit ?? (pack.units.length === 1 ? pack.units[0] : null);
		const propertyId = target?.propertyId ?? findProperty(pack, q)?.id ?? null;
		if (!propertyId) {
			return {
				reply:
					`Which property or unit is it for? Your units are:\n` +
					pack.units
						.slice(0, 12)
						.map((u) => `- ${u.propertyName} · ${u.name}`)
						.join('\n'),
				sources: [{ label: 'Maintenance', href: '/maintenance' }],
				action: null
			};
		}
		const title = draftTicketTitle(q, target?.name ?? null);
		const triage = heuristicTriage({ title: title || q, description: q });
		return {
			reply: `Here's a work order draft for ${[target?.propertyName ?? 'the property', target?.name].filter(Boolean).join(' · ')} — review and confirm:`,
			sources: [{ label: 'Maintenance', href: '/maintenance' }],
			action: {
				type: 'create_ticket',
				input: {
					propertyId,
					unitId: target?.id ?? null,
					tenantId: tenant?.id ?? null,
					title: title ? title[0]!.toUpperCase() + title.slice(1) : 'Maintenance request',
					description: q,
					priority: triage.priority
				}
			}
		};
	}

	if (DRAFT_MSG_VERB.test(q) && DRAFT_MSG.test(q)) {
		if (ctx?.perms && !allows(ctx.perms, 'messages', 'read'))
			return { reply: 'Your role cannot read tenant messages.', sources: [], action: null };
		if (!tenant) {
			return {
				reply:
					`Who should the message go to? Tenants on file:\n` +
					pack.tenants
						.slice(0, 12)
						.map(
							(t) => `- ${tenantName(t)}${t.unitName ? ` · ${t.propertyName} ${t.unitName}` : ''}`
						)
						.join('\n'),
				sources: [{ label: 'Messages', href: '/messages' }],
				action: null
			};
		}
		return {
			reply: `Draft reply for ${tenantName(tenant)}:`,
			sources: [{ label: 'Open thread', href: `/messages/${tenant.id}` }],
			action: {
				type: 'draft_reply',
				tenantId: tenant.id,
				tenantName: tenantName(tenant),
				body: await draftReply(orgId, tenant.id)
			}
		};
	}

	if (SCREENING.test(q)) {
		return {
			reply:
				`I can't advise on screening decisions — approval, denial, and ranking of applicants are always your call, made consistently. ` +
				`I can point you at the application or lead so you can review the facts yourself.`,
			sources: [{ label: 'Leads & applications', href: '/leasing' }],
			action: null
		};
	}

	if (VACANT.test(q)) {
		const vacant = pack.units.filter((u) => u.status === 'vacant' || u.status === 'notice');
		return {
			reply: vacant.length
				? `${vacant.length} of ${pack.units.length} units are available:\n` +
					vacant
						.map(
							(u) =>
								`- ${u.propertyName} · ${u.name}${u.marketRent ? ` · ${formatMoney(u.marketRent)}` : ''}${u.status === 'notice' ? ' (notice)' : ''}`
						)
						.join('\n')
				: `All ${pack.units.length} units are occupied — nothing is vacant right now.`,
			sources: [{ label: 'Properties', href: '/properties' }],
			action: null
		};
	}

	if (EXPIRING.test(q) || (LEASE_OF.test(q) && tenant)) {
		const soon = pack.leases
			.filter((l) => l.status === 'active' && l.endDate)
			.filter((l) => daysUntil(l.endDate!) <= 90)
			.sort((a, b) => (a.endDate! < b.endDate! ? -1 : 1));
		if (tenant && LEASE_OF.test(q)) {
			const l = pack.leases.find((x) => x.id === tenant.leaseId);
			if (!l)
				return {
					reply: `${tenantName(tenant)} has no active lease on file.`,
					sources: [{ label: 'Leases', href: '/leases' }],
					action: null
				};
			return {
				reply: `${tenantName(tenant)}'s lease on ${l.propertyName} · ${l.unitName} runs to ${l.endDate ?? 'month-to-month'} at ${formatMoney(l.rentAmount, l.currency)}/mo${l.balance > 0 ? `, with ${formatMoney(l.balance, l.currency)} outstanding` : ''}.`,
				sources: [{ label: 'Open lease', href: `/leases/${l.id}` }],
				action: null
			};
		}
		return {
			reply: soon.length
				? `${soon.length} active lease${soon.length === 1 ? '' : 's'} ending in the next 90 days:\n` +
					soon
						.map(
							(l) =>
								`- ${l.propertyName} · ${l.unitName} (${l.tenants}) — ${l.endDate}, ${formatMoney(l.rentAmount, l.currency)}/mo`
						)
						.join('\n')
				: 'No active leases end in the next 90 days.',
			sources: [{ label: 'Leases', href: '/leases' }],
			action: null
		};
	}

	if (DELINQUENT.test(q)) {
		const owing = pack.leases.filter((l) => l.status === 'active' && l.balance > 0);
		const total = owing.reduce((s, l) => s + l.balance, 0);
		return {
			reply: owing.length
				? `${owing.length} lease${owing.length === 1 ? '' : 's'} carry a balance — ${formatMoney(total, owing[0]!.currency)} total:\n` +
					owing
						.map(
							(l) =>
								`- ${l.tenants} (${l.propertyName} · ${l.unitName}) — ${formatMoney(l.balance, l.currency)}`
						)
						.join('\n')
				: 'No outstanding balances — every active lease is paid up.',
			sources: [{ label: 'Rent roll', href: '/rent' }],
			action: null
		};
	}

	if (WHO_IN.test(q) && unit) {
		const l = pack.leases.find((x) => x.unitId === unit.id && x.status === 'active');
		return {
			reply: l
				? `${l.tenants} hold${l.tenants.includes(' & ') || l.tenants.includes(',') ? '' : 's'} the active lease on ${unit.propertyName} · ${unit.name} — ends ${l.endDate ?? 'month-to-month'}.`
				: `${unit.propertyName} · ${unit.name} has no active lease — it's ${unit.status}.`,
			sources: l
				? [{ label: 'Open lease', href: `/leases/${l.id}` }]
				: [{ label: 'Properties', href: '/properties' }],
			action: null
		};
	}

	if (TICKET_Q.test(q)) {
		const open = pack.tickets.filter(
			(t) => t.status !== 'done' && t.status !== 'cancelled' && (!unit || t.unitId === unit.id)
		);
		const hot = open.filter((t) => t.priority === 'urgent' || t.priority === 'high');
		return {
			reply: open.length
				? `${open.length} open request${open.length === 1 ? '' : 's'}${unit ? ` for ${unit.propertyName} · ${unit.name}` : ''} — ${hot.length} urgent/high:\n` +
					open
						.slice(0, 8)
						.map(
							(t) =>
								`- #${t.number} ${t.title} (${t.priority}, ${t.status.replace('_', ' ')}) — ${t.propertyName}${t.unitName ? ` · ${t.unitName}` : ''}`
						)
						.join('\n')
				: `No open maintenance requests${unit ? ` for ${unit.propertyName} · ${unit.name}` : ''}.`,
			sources: [{ label: 'Maintenance', href: '/maintenance' }],
			action: null
		};
	}

	if (LISTING_Q.test(q)) {
		const live = pack.listings.filter((l) => l.status === 'published');
		return {
			reply: live.length
				? `${live.length} published listing${live.length === 1 ? '' : 's'}:\n` +
					live
						.map(
							(l) =>
								`- ${l.title ?? `${l.propertyName} · ${l.unitName}`} — ${formatMoney(l.rentAmount, l.currency)}${l.newApplications ? ` · ${l.newApplications} new application${l.newApplications === 1 ? '' : 's'}` : ''}`
						)
						.join('\n')
				: 'No listings are published right now.',
			sources: [{ label: 'Leasing', href: '/leasing' }],
			action: null
		};
	}

	if (VENDOR_Q.test(q)) {
		const trade = q
			.match(
				/\b(plumber|plumbing|electrician|electrical|hvac|pest|roofing|appliance|grounds|landscap\w*|locksmith|handyman|general)\b/i
			)?.[1]
			?.toLowerCase();
		const hit = trade
			? pack.vendors.filter((v) =>
					v.trades.some((t) => t.toLowerCase().includes(trade.replace(/ing$|ian$|al$/, '')))
				)
			: pack.vendors;
		return {
			reply: hit.length
				? `${hit.length} vendor${hit.length === 1 ? '' : 's'}${trade ? ` for ${trade}` : ''}:\n` +
					hit
						.slice(0, 10)
						.map((v) => `- ${v.name} — ${v.trades.join(', ') || 'general'}`)
						.join('\n')
				: `No vendors${trade ? ` tagged ${trade}` : ''} on file yet.`,
			sources: [{ label: 'Vendors', href: '/vendors' }],
			action: null
		};
	}

	if (LEAD_Q.test(q)) {
		const byStage = new Map<string, number>();
		for (const l of pack.leads) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);
		const apps = pack.listings.reduce((s, l) => s + (l.newApplications ?? 0), 0);
		return {
			reply:
				`${pack.leads.length} leads in the pipeline` +
				(byStage.size
					? ` — ${[...byStage].map(([s, n]) => `${n} ${s.replace('_', ' ')}`).join(', ')}`
					: '') +
				(apps ? `. ${apps} unreviewed application${apps === 1 ? '' : 's'} across listings.` : '.'),
			sources: [{ label: 'Leasing', href: '/leasing' }],
			action: null
		};
	}

	return {
		reply:
			`I can answer questions grounded in your workspace — try:\n` +
			`- "What's vacant right now?"\n` +
			`- "Which leases expire soon?"\n` +
			`- "Anyone behind on rent?"\n` +
			`- "Any urgent tickets?"\n` +
			`- "Draft a work order for a leaking sink in 101"\n` +
			`- "Draft a reply to ${pack.tenants[0] ? tenantName(pack.tenants[0]) : 'a tenant'}"`,
		sources: [{ label: 'Dashboard', href: '/dashboard' }],
		action: null
	};
}

/* ---------- matching helpers ---------- */

function tenantName(t: { firstName: string; lastName: string; companyName: string | null }) {
	return t.companyName || `${t.firstName} ${t.lastName}`.trim();
}

function escapeRe(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strips the command phrasing from a draft-work-order question into a title. */
export function draftTicketTitle(q: string, unitName: string | null) {
	return (
		q
			.replace(DRAFT_VERB, '')
			.replace(/\bopen\b/i, ' ')
			.replace(/work ?order|ticket|maintenance request/gi, ' ')
			// unit names get word boundaries so 'A' can't eat the 'a' in 'leaking'
			.replace(unitName ? new RegExp(`\\b${escapeRe(unitName)}\\b`, 'gi') : /^$/, ' ')
			.replace(/\b(a|an|the|new|for|on|at|in|to|of|unit|apt)\b/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

export function findUnit(pack: Pack, q: string) {
	const lower = q.toLowerCase();
	for (const u of pack.units) {
		const name = u.name.toLowerCase();
		if (name.length <= 2) {
			// Short names only count with an explicit unit-ish anchor — otherwise
			// 'A' matches the article 'a' and binds the wrong unit.
			if (
				new RegExp(`\\b(unit|apt|apartment|suite|ste|room|#)\\s*${escapeRe(name)}\\b`).test(
					lower
				) ||
				lower.includes(`${u.propertyName.toLowerCase()} ${name}`)
			)
				return u;
		} else if (new RegExp(`\\b${escapeRe(name)}\\b`).test(lower)) {
			return u;
		}
	}
	return null;
}

function findProperty(pack: Pack, q: string) {
	const lower = q.toLowerCase();
	return pack.properties.find((p) => lower.includes(p.name.toLowerCase())) ?? null;
}

function findTenant(pack: Pack, q: string) {
	const lower = q.toLowerCase();
	return (
		pack.tenants.find((t) => {
			const name = tenantName(t).toLowerCase();
			if (name.length > 2 && lower.includes(name)) return true;
			const last = t.lastName.toLowerCase();
			const first = t.firstName.toLowerCase();
			return (
				(last.length > 3 && new RegExp(`\\b${escapeRe(last)}\\b`).test(lower)) ||
				(first.length > 3 &&
					new RegExp(`\\b${escapeRe(first)}\\b`).test(lower) &&
					/\b(to|for|from|of|with|'s)\b/.test(lower))
			);
		}) ?? null
	);
}

function daysUntil(iso: string) {
	return Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86_400_000);
}

function vsafe<S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<S> | null {
	const r = v.safeParse(schema, value);
	return r.success ? r.output : null;
}
