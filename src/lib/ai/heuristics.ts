/**
 * Deterministic, keyless AI fallbacks. Every AI feature calls the configured
 * provider first (src/lib/server/ai) and falls back to these functions when no
 * AI_API_KEY is set, so drafts and triage always produce something useful.
 */

export type Triage = {
	priority: 'low' | 'normal' | 'high' | 'urgent';
	trade: string | null;
	reason: string;
};

const URGENT = [
	/\b(flood|flooding|burst|gushing|sewage|gas (leak|smell)|smell gas|smoke|fire|no heat|no water|no hot water|spark|sparking|carbon monoxide|insecure|break-?in)\b/i,
	/\b(overflowing|electrical (fire|shock)|tree (fell|through)|pour(ing|ed|s)? (water|through|down|in))\b/i
];
const HIGH = [
	/\b(broken|stopped working|not working|won't (turn on|start|stop|lock)|won’t (turn on|start|stop|lock)|no (a\/?c|air conditioning|heat)|soaked|mold|mildew|rotten|dangling|exposed|ceiling (fell|is falling)|door won’t close|door won't close|lock (broke|broken|doesn't work))\b/i
];
const LOW = [/\b(cosmetic|paint|stain|scuff|squeak|loose handle|minor|touch-?up)\b/i];

const TRADES: [RegExp, string][] = [
	[
		/\b(leak|pipe|sink|toilet|drain|faucet|shower|bathtub|water|sewage|garbage disposal|sprinkler)\b/i,
		'plumbing'
	],
	[/\b(outlet|breaker|electrical|light fixture|switch|wiring|doorbell|sparking)\b/i, 'electrical'],
	[
		/\b(a\/?c|ac unit|hvac|heater|heating|furnace|thermostat|vent|air conditioning|boiler)\b/i,
		'hvac'
	],
	[/\b(ant|roach|rodent|mouse|mice|rat|termite|bed ?bug|wasp|pest)\b/i, 'pest'],
	[/\b(roof|gutter|shingle|ceiling (leak|drip)|skylight)\b/i, 'roofing'],
	[
		/\b(fridge|refrigerator|dishwasher|washer|dryer|oven|stove|microwave|garbage disposal)\b/i,
		'appliance'
	],
	[/\b(fence|yard|landscap|lawn|tree|bush|gate)\b/i, 'grounds'],
	[/\b(lock|key|doorbell|window (lock|won't)|intercom|entry)\b/i, 'locksmith'],
	[/\b(paint|drywall|wall|floor|tile|caulk|handyman|carpet)\b/i, 'general']
];

export function heuristicTriage(input: {
	title: string;
	description?: string | null;
	trades?: string[];
}): Triage {
	const text = `${input.title} ${input.description ?? ''}`;
	const priority = URGENT.some((re) => re.test(text))
		? 'urgent'
		: HIGH.some((re) => re.test(text))
			? 'high'
			: LOW.some((re) => re.test(text))
				? 'low'
				: 'normal';
	const found = TRADES.find(([re]) => re.test(text))?.[1] ?? null;
	const trade = found
		? (input.trades?.find((t) => t.toLowerCase() === found) ??
			input.trades?.find((t) => t.toLowerCase().includes(found)) ??
			found)
		: null;
	const reason =
		priority === 'urgent'
			? 'Reads like an emergency — safety or active damage risk, respond immediately.'
			: priority === 'high'
				? 'Something is broken and affecting habitability — prioritize today.'
				: priority === 'low'
					? 'Cosmetic or minor — safe to batch with other work.'
					: 'Routine request — no urgency signals in the description.';
	return { priority, trade, reason };
}

export function heuristicReply(input: {
	tenantName: string;
	unitName?: string | null;
	lastMessages: { authorType: 'staff' | 'tenant'; body: string }[];
}): string {
	const lastTenant = [...input.lastMessages].reverse().find((m) => m.authorType === 'tenant');
	const first = input.tenantName.split(' ')[0] || 'there';
	const text = (lastTenant?.body ?? '').toLowerCase();
	if (!lastTenant) return `Hi ${first}, thanks for reaching out — how can I help?`;
	if (/\b(rent|payment|pay|invoice|balance|charge|late fee)\b/.test(text))
		return `Hi ${first}, thanks for flagging this. I'm looking into the charge on your account and will get back to you shortly — in the meantime, nothing is due until we've sorted it out.`;
	if (/\b(tour|visit|viewing|showing|application|apply|move ?in)\b/.test(text))
		return `Hi ${first}, thanks for reaching out. I'll check the schedule and confirm a time shortly — I'll send the details here once it's set.`;
	if (
		/\b(heat|hot water|leak|broken|repair|fix|maintenance|toilet|sink|a\/?c|heat|smell|mold|pest)\b/.test(
			text
		)
	)
		return `Hi ${first}, sorry you're dealing with this. I've logged a maintenance request and will get someone scheduled as soon as possible — I'll keep you updated here.`;
	if (/\?$/.test(lastTenant.body.trim()) || /\b(can|could|would|do you|is it|when)\b/.test(text))
		return `Hi ${first}, thanks for reaching out. Let me look into that for you — I'll follow up here shortly with an answer.`;
	return `Hi ${first}, thanks for reaching out. I've got this and will follow up shortly — let me know if anything else comes up.`;
}

export function heuristicListingCopy(input: {
	propertyName: string;
	unitName: string;
	bedrooms?: number | null;
	bathrooms?: number | null;
	rentAmount?: number | null;
	amenities?: string[];
	availableOn?: string | null;
}): { title: string; description: string } {
	const br =
		input.bedrooms == null ? null : input.bedrooms === 0 ? 'studio' : `${input.bedrooms}-bedroom`;
	const ba = input.bathrooms ? `${input.bathrooms}-bath` : null;
	const spec = [br, ba].filter(Boolean).join(' ') || 'home';
	const title = `Bright ${spec} at ${input.propertyName}`;
	const amen = (input.amenities ?? []).slice(0, 5);
	const rent =
		input.rentAmount != null ? `$${Math.round(input.rentAmount / 100).toLocaleString()}/mo` : null;
	const avail = input.availableOn
		? `Available ${new Date(input.availableOn + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`
		: 'Available now.';
	const description = [
		`Welcome to ${input.unitName} at ${input.propertyName} — a ${spec} home that puts comfort and convenience first.`,
		amen.length
			? `Highlights include ${amen.slice(0, -1).join(', ')}${amen.length > 1 ? ' and ' : ''}${amen[amen.length - 1]}.`
			: null,
		rent ? `Rent is ${rent}.` : null,
		`${avail} Schedule a tour today — applications are handled online and we respond quickly.`
	]
		.filter(Boolean)
		.join('\n\n');
	return { title, description };
}

export type LeaseExtract = {
	tenants: string[];
	startDate: string | null;
	endDate: string | null;
	rentAmount: number | null;
	depositAmount: number | null;
};

const MONTHS: Record<string, number> = {
	january: 0,
	february: 1,
	march: 2,
	april: 3,
	may: 4,
	june: 5,
	july: 6,
	august: 7,
	september: 8,
	october: 9,
	november: 10,
	december: 11
};

function toISO(y: number, m: number, d: number): string | null {
	if (m < 0 || m > 11 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
	return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function dateISO(text: string): string | null {
	// 2026-01-05
	const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
	if (iso) return toISO(+iso[1], +iso[2] - 1, +iso[3]);
	// January 5, 2026  /  5 January 2026
	const named =
		/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(
			text
		) ??
		/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:day of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)[,\s]+(\d{4})\b/i.exec(
			text
		);
	if (named) {
		const [mStr, dStr, yStr] = isNaN(+named[1])
			? [named[1], named[2], named[3]]
			: [named[2], named[1], named[3]];
		return toISO(+yStr, MONTHS[mStr.toLowerCase()], +dStr);
	}
	// 01/05/2026 (US month-first) or 05/01/2026 (day-first when day > 12)
	const slash = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/.exec(text);
	if (slash) {
		const [a, b] = [+slash[1], +slash[2]];
		return a > 12 ? toISO(+slash[3], b - 1, a) : toISO(+slash[3], a - 1, b);
	}
	return null;
}

function moneyCents(text: string): number | null {
	const m = /\$\s*([\d,]+(?:\.\d{2})?)/.exec(text);
	if (!m) return null;
	return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
}

/** Pulls lease fields out of PDF text when no AI provider is configured. */
export function heuristicLeaseExtract(text: string): LeaseExtract {
	const rent =
		moneyCents(
			/(?:monthly|month)\s+rent[^\d$]{0,20}\$?[\d,]+/i.exec(text)?.[0] ??
				/rent[^\n]{0,30}\$[\d,]+/i.exec(text)?.[0] ??
				/\$[\d,]+(?:\.\d{2})?\s*(?:per month|\/\s*month|monthly)/i.exec(text)?.[0] ??
				''
		) ?? moneyCents(text);
	const depositBefore = /\$[\d,]+(?:\.\d{2})?[^\n]{0,40}security\s+deposit/i.exec(text)?.[0];
	const deposit =
		moneyCents(/security\s+deposit[^\n]{0,40}\$[\d,]+/i.exec(text)?.[0] ?? '') ??
		moneyCents(/deposit[^\n]{0,30}\$[\d,]+/i.exec(text)?.[0] ?? '') ??
		(depositBefore ? moneyCents(depositBefore) : null);

	const dates = [
		/(?:commence|begin|start)(?:ing|ment)?\s*(?:date|on)?\s*[:\-–]?\s*([^\n;]{4,40})/i.exec(
			text
		)?.[1],
		/(?:terminat|expir|end)(?:es|s|ing|ation)?\s*(?:date|on)?\s*[:\-–]?\s*([^\n;]{4,40})/i.exec(
			text
		)?.[1],
		/from\s+([^\n;]{4,40}?)\s+(?:to|until|through)\s+([^\n;]{4,40})/i.exec(text)
	];
	let startDate: string | null = null;
	let endDate: string | null = null;
	if (typeof dates[0] === 'string') startDate = dateISO(dates[0]);
	if (typeof dates[1] === 'string') endDate = dateISO(dates[1]);
	if (!startDate && dates[2]) {
		const m = /from\s+([^\n;]{4,40}?)\s+(?:to|until|through)\s+([^\n;]{4,40})/i.exec(text)!;
		startDate = dateISO(m[1]);
		endDate = dateISO(m[2]);
	}

	const tenants: string[] = [];
	const tenantList =
		/[Tt]enants?[: \t]+([A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,3}(?:[ \t]*(?:,|&|and)[ \t]*[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){1,3})*)/.exec(
			text
		);
	if (tenantList)
		tenants.push(...tenantList[1].split(/[ \t]*(?:,|&|and)[ \t]*/).map((s) => s.trim()));
	const between = /between\s+[^\n]{0,80}?and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/.exec(text);
	if (between && !tenants.includes(between[1])) tenants.push(between[1]);
	const lessee = /lessee[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/.exec(text);
	if (lessee && !tenants.includes(lessee[1])) tenants.push(lessee[1]);

	return {
		tenants: [...new Set(tenants)].slice(0, 6),
		startDate,
		endDate,
		rentAmount: rent,
		depositAmount: deposit
	};
}

export type Insight = { title: string; body: string; href: string };

/** Rule-based dashboard insight cards when no AI provider is configured. */
export function heuristicInsights(facts: {
	overdueCount: number;
	overdueAmount: number;
	collectedPct: number;
	expiringLeases: number;
	soonestExpiryDays: number | null;
	openTickets: number;
	urgentTickets: number;
	expiringVendorInsurance: number;
	vacantUnits: number;
	leadsNeedingAttention: number;
	openTurns: number;
}): Insight[] {
	const money = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;
	const out: Insight[] = [];
	if (facts.overdueCount)
		out.push({
			title: `${facts.overdueCount} charge${facts.overdueCount === 1 ? ' is' : 's are'} past due`,
			body: `${money(facts.overdueAmount)} outstanding (${facts.collectedPct}% collected). Worth a nudge on the rent roll.`,
			href: '/rent'
		});
	if (facts.expiringLeases)
		out.push({
			title: `${facts.expiringLeases} lease${facts.expiringLeases === 1 ? ' ends' : 's end'} within 60 days`,
			body:
				facts.soonestExpiryDays != null && facts.soonestExpiryDays <= 14
					? `One ends in ${facts.soonestExpiryDays} days — start renewal or turn planning now.`
					: 'Renewals sent early cut vacancy loss.',
			href: '/leases'
		});
	if (facts.urgentTickets)
		out.push({
			title: `${facts.urgentTickets} urgent maintenance request${facts.urgentTickets === 1 ? '' : 's'} open`,
			body: 'Urgent tickets age fast — triage and assign vendors today.',
			href: '/maintenance'
		});
	else if (facts.openTickets > 5)
		out.push({
			title: `${facts.openTickets} open maintenance requests`,
			body: 'The queue is growing — worth a pass before the weekend.',
			href: '/maintenance'
		});
	if (facts.expiringVendorInsurance)
		out.push({
			title: `${facts.expiringVendorInsurance} vendor insurance certificate${facts.expiringVendorInsurance === 1 ? ' is' : 's are'} expiring`,
			body: 'Expired COIs mean liability on your properties — chase renewals.',
			href: '/vendors'
		});
	if (facts.leadsNeedingAttention)
		out.push({
			title: `${facts.leadsNeedingAttention} lead${facts.leadsNeedingAttention === 1 ? ' needs' : 's need'} a follow-up`,
			body: 'Fast replies convert tours — the pipeline is waiting.',
			href: '/leasing'
		});
	if (facts.vacantUnits)
		out.push({
			title: `${facts.vacantUnits} unit${facts.vacantUnits === 1 ? ' is' : 's are'} vacant`,
			body: 'List them to start generating demand.',
			href: '/leasing'
		});
	if (facts.openTurns)
		out.push({
			title: `${facts.openTurns} unit turn${facts.openTurns === 1 ? '' : 's'} in progress`,
			body: 'Every day of turn is lost rent — check the board.',
			href: '/maintenance'
		});
	return out.slice(0, 4);
}

export const DOC_CATEGORIES = [
	'lease',
	'insurance',
	'tax',
	'invoice',
	'inspection',
	'photo',
	'notice',
	'agreement',
	'other'
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

const DOC_RULES: [RegExp, DocCategory][] = [
	[/\b(lease|rental agreement|addendum|renewal)\b/i, 'lease'],
	[/\b(coi|certificate of insurance|insurance|policy|liability)\b/i, 'insurance'],
	[/\b(w-?9|w-?4|1099|tax|ein)\b/i, 'tax'],
	[/\b(invoice|receipt|bill|statement|payment)\b|\binv[-_]?\d/i, 'invoice'],
	[/\b(inspection|checklist|move-?in|move-?out|walkthrough|walk-?through)\b/i, 'inspection'],
	[/\b(notice|eviction|demand|violation|warning)\b/i, 'notice'],
	[/\b(agreement|contract|proposal|estimate|quote|scope)\b/i, 'agreement']
];

export function heuristicDocCategory(name: string, contentType: string): DocCategory {
	if (contentType.startsWith('image/')) return 'photo';
	const hit = DOC_RULES.find(([re]) => re.test(name));
	return hit ? hit[1] : 'other';
}

export type AiSummary = { summary: string; flags: string[] };

export function heuristicTenantSummary(input: {
	name: string;
	leases: {
		status: string;
		propertyName: string;
		unitName: string;
		endDate: string;
		balance: number;
		rentAmount: number | null;
		currency: string | null;
	}[];
	ticketCount: number;
	openTickets: number;
	paymentsLast12m: number;
	paidOnTime?: boolean | null;
}): AiSummary {
	const active = input.leases.find((l) => l.status === 'active');
	const flags: string[] = [];
	const parts: string[] = [];
	if (active) {
		parts.push(
			`${input.name} rents ${active.unitName} at ${active.propertyName}` +
				(active.rentAmount != null
					? ` for ${fmtCents(active.rentAmount, active.currency)}/mo`
					: '') +
				`, lease ending ${active.endDate}.`
		);
	} else {
		parts.push(`${input.name} has no active lease.`);
	}
	const balance = input.leases.reduce((s, l) => s + Math.max(0, l.balance), 0);
	if (balance > 0) {
		parts.push(`Outstanding balance: ${fmtCents(balance, active?.currency ?? null)}.`);
		flags.push('Carries a balance');
	} else if (active) {
		parts.push('Account is current.');
	}
	if (input.paymentsLast12m > 0)
		parts.push(
			`${input.paymentsLast12m} payment${input.paymentsLast12m === 1 ? '' : 's'} in the last year.`
		);
	if (input.ticketCount > 0) {
		parts.push(
			`${input.ticketCount} maintenance request${input.ticketCount === 1 ? '' : 's'} on file` +
				(input.openTickets ? `, ${input.openTickets} still open` : '') +
				'.'
		);
		if (input.openTickets > 2) flags.push(`${input.openTickets} open maintenance requests`);
	}
	const soon = input.leases.find(
		(l) => l.status === 'active' && daysUntil(l.endDate) >= 0 && daysUntil(l.endDate) <= 90
	);
	if (soon) flags.push(`Lease ends ${soon.endDate} — renewal not yet lined up`);
	return { summary: parts.join(' '), flags };
}

export function heuristicReportSummary(input: {
	title: string;
	subtitle: string;
	columns: { key: string; label: string; type?: string }[];
	rows: Record<string, string | number | null>[];
	totals: Record<string, string | number | null> | null;
}): AiSummary {
	const { rows, totals, columns } = input;
	const flags: string[] = [];
	const moneyCols = columns.filter((c) => c.type === 'money' && totals?.[c.key] != null);
	const money = moneyCols
		.map((c) => `${c.label.toLowerCase()} ${fmtCents(Number(totals![c.key]), null)}`)
		.join(', ');
	const summary = `${input.title}: ${rows.length} row${rows.length === 1 ? '' : 's'}${money ? ` — ${money}` : ''}.`;
	const numCols = columns.filter((c) => c.type === 'number' || c.type === 'money');
	for (const c of numCols) {
		let worst: { name: string; v: number } | null = null;
		for (const r of rows.slice(0, 200)) {
			const v = Number(r[c.key]);
			const name = String(r[columns[0]!.key] ?? '');
			if (!Number.isFinite(v) || !name) continue;
			if (!worst || v > worst.v) worst = { name, v };
		}
		if (worst && worst.v > 0 && rows.length > 2) {
			const disp = c.type === 'money' ? fmtCents(worst.v, null) : worst.v.toLocaleString('en-US');
			flags.push(`Highest ${c.label.toLowerCase()}: ${worst.name} (${disp})`);
			break;
		}
	}
	const empty = rows.filter((r) => numCols.every((c) => !Number(r[c.key]))).length;
	if (rows.length >= 5 && empty / rows.length > 0.5)
		flags.push('More than half the rows have no activity.');
	return { summary, flags };
}

export function heuristicVendorPick(input: {
	vendors: {
		id: string;
		name: string;
		trades: string[];
		jobsCompleted: number;
		avgCost: number | null;
		insuranceExpiresOn: string | null;
	}[];
	trade: string | null;
}): { vendorId: string; reason: string } | null {
	const insured = (v: { insuranceExpiresOn: string | null }) =>
		!v.insuranceExpiresOn || daysUntil(v.insuranceExpiresOn) > 0;
	const matching = input.vendors.filter(
		(v) =>
			insured(v) &&
			(input.trade
				? v.trades.some((t) => t.toLowerCase().includes(input.trade!.toLowerCase()))
				: true)
	);
	if (!matching.length) return null;
	matching.sort((a, b) => b.jobsCompleted - a.jobsCompleted || (a.avgCost ?? 0) - (b.avgCost ?? 0));
	const top = matching[0]!;
	return {
		vendorId: top.id,
		reason:
			`${top.name} handles ${input.trade ?? 'this kind of'} work` +
			(top.jobsCompleted
				? ` — ${top.jobsCompleted} job${top.jobsCompleted === 1 ? '' : 's'} completed for you`
				: '') +
			(top.insuranceExpiresOn
				? `, insured through ${top.insuranceExpiresOn}`
				: ', no COI on file to expire') +
			'.'
	};
}

export function heuristicDigest(input: {
	orgName: string;
	paymentsCount: number;
	paymentsTotal: number;
	currency: string | null;
	newTickets: { number: number; title: string; priority: string }[];
	closedTickets: number;
	expiringLeases: { tenant: string; unit: string; endDate: string }[];
	expiringCois: { vendor: string; expiresOn: string }[];
	newLeads: number;
}): { subject: string; intro: string; lines: string[] } {
	const lines: string[] = [];
	if (input.paymentsCount)
		lines.push(
			`${input.paymentsCount} payment${input.paymentsCount === 1 ? '' : 's'} received (${fmtCents(input.paymentsTotal, input.currency)}).`
		);
	for (const t of input.newTickets)
		lines.push(
			`New request #${t.number}: ${t.title}${t.priority === 'urgent' ? ' — marked urgent' : ''}.`
		);
	if (input.closedTickets)
		lines.push(`${input.closedTickets} request${input.closedTickets === 1 ? '' : 's'} closed.`);
	for (const l of input.expiringLeases)
		lines.push(`${l.tenant}’s lease on ${l.unit} ends ${l.endDate} — no renewal yet.`);
	for (const c of input.expiringCois) lines.push(`${c.vendor}’s insurance expires ${c.expiresOn}.`);
	if (input.newLeads)
		lines.push(`${input.newLeads} new lead${input.newLeads === 1 ? '' : 's'} to follow up with.`);
	return {
		subject: `Your ${input.orgName} daily digest`,
		intro: lines.length
			? `Here’s what needs your attention at ${input.orgName} today:`
			: `Quiet day at ${input.orgName} — nothing needs your attention.`,
		lines
	};
}

function fmtCents(cents: number, currency: string | null): string {
	const code = currency ?? 'usd';
	try {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(
			cents / 100
		);
	} catch {
		return `$${(cents / 100).toFixed(2)}`;
	}
}

function daysUntil(date: string): number {
	return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.now()) / 86_400_000);
}

// ---- Snap decisions (emergency, duplicate, lead score, message class, delinquency) ----

const STOPWORDS = new Set(
	'a an and are as at be but by for from has have i in is it its me my of on or our so that the their them they this to was we with you your please hi hey thanks thank can could would should'.split(
		' '
	)
);

function keywords(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((w) => w.length > 2 && !STOPWORDS.has(w))
	);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (!a.size || !b.size) return 0;
	let shared = 0;
	for (const w of a) if (b.has(w)) shared++;
	return shared / (a.size + b.size - shared);
}

export type IntakeDecision = {
	emergency: boolean;
	reason: string | null;
	/** Candidate ticket id when the request repeats an open one. */
	duplicateOf: string | null;
	duplicateReason: string | null;
};

export function heuristicIntake(input: {
	title: string;
	description?: string | null;
	candidates: { id: string; title: string; description?: string | null }[];
}): IntakeDecision {
	const text = `${input.title} ${input.description ?? ''}`;
	const emergency = URGENT.some((re) => re.test(text));
	const kw = keywords(text);
	let dup: { id: string; score: number } | null = null;
	for (const c of input.candidates) {
		const score = jaccard(kw, keywords(`${c.title} ${c.description ?? ''}`));
		if (score >= 0.45 && (!dup || score > dup.score)) dup = { id: c.id, score };
	}
	return {
		emergency,
		reason: emergency
			? 'Reads like an emergency — safety or active damage risk, respond immediately.'
			: null,
		duplicateOf: dup?.id ?? null,
		duplicateReason: dup ? 'Very similar wording to an open request at the same home.' : null
	};
}

export type LeadScore = { score: 'hot' | 'warm' | 'cold'; reason: string };

export function heuristicLeadScore(input: {
	email?: string | null;
	phone?: string | null;
	moveInDate?: string | null;
	propertyName?: string | null;
	listingTitle?: string | null;
	source: string;
	message?: string | null;
	/** ISO date used for "days until move-in"; defaults to today. */
	today?: string;
}): LeadScore {
	const text = (input.message ?? '').toLowerCase();
	const today = input.today ?? new Date().toISOString().slice(0, 10);
	const why: string[] = [];
	let pts = 0;
	if (input.email && input.phone) pts += 2;
	else if (input.email || input.phone) pts += 1;
	if (input.moveInDate) {
		const days = Math.round(
			(Date.parse(`${input.moveInDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000
		);
		if (days >= 0 && days <= 30) {
			pts += 2;
			why.push(`wants to move in ~${days}d`);
		} else if (days > 0 && days <= 90) {
			pts += 1;
			why.push('move-in inside 90 days');
		}
	}
	const home = input.listingTitle ?? input.propertyName;
	if (home) {
		pts += 1;
		why.push(`named a home: ${home}`);
	}
	if (input.source === 'application') {
		pts += 2;
		why.push('already submitted an application');
	}
	if (
		/\b(asap|urgent|immediately|right away|this (week|month)|ready to (move|sign|lease)|deposit ready)\b/i.test(
			text
		)
	) {
		pts += 2;
		why.push('signaled urgency in their message');
	} else if (input.message && input.message.trim().length > 40) {
		pts += 1;
		why.push('wrote a real inquiry');
	}
	const score = pts >= 5 ? 'hot' : pts >= 2 ? 'warm' : 'cold';
	const reason = why.length
		? `${why.slice(0, 2).join('; ')}.`
		: 'Little to go on — just a name and one way to reach them.';
	return { score, reason };
}

export type MessageCategory = 'maintenance' | 'payment' | 'lease' | 'other';
export type MessageClass = { category: MessageCategory; urgent: boolean };

const MESSAGE_RULES: [MessageCategory, RegExp][] = [
	[
		'payment',
		/\b(rent|payment|pay|invoice|balance|charge|late fee|autopay|deposit|refund|bill|owed)\b/i
	],
	[
		'lease',
		/\b(lease|renew|renewal|move[- ]?out|notice|sublet|roommate|guest|pet|parking|locked? out|keys?)\b/i
	],
	[
		'maintenance',
		/\b(repair|fix|broken|leak|leaking|heat|a\/?c|hvac|toilet|sink|mold|mildew|pest|smell|gas|water|door|window|light|outlet|dishwasher|fridge|noise|ceiling)\b/i
	]
];

export function heuristicMessageClass(body: string): MessageClass {
	return {
		category: MESSAGE_RULES.find(([, re]) => re.test(body))?.[0] ?? 'other',
		urgent: URGENT.some((re) => re.test(body))
	};
}

export type Delinquency = { watch: boolean; reason: string };

export function heuristicDelinquency(input: {
	/** Outstanding cents on charges already due. */
	balanceCents: number;
	/** Monthly rent in cents, when the lease has rent charges. */
	monthlyRentCents: number;
	/** Payments made more than a week after the charge's due date, last 6 months. */
	lateCount6m: number;
	/** Charges that came due in the last 6 months. */
	dueCount6m: number;
	lastPaymentAt: string | null;
	/** ISO date; defaults to today. */
	today?: string;
}): Delinquency {
	if (input.balanceCents <= 0) return { watch: false, reason: '' };
	const today = input.today ?? new Date().toISOString().slice(0, 10);
	const daysSincePay = input.lastPaymentAt
		? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(input.lastPaymentAt)) / 86400_000)
		: null;
	if (input.monthlyRentCents > 0 && input.balanceCents >= 2 * input.monthlyRentCents)
		return {
			watch: true,
			reason: `Owes about ${Math.round(input.balanceCents / input.monthlyRentCents)} months of rent.`
		};
	if (input.dueCount6m >= 3 && input.lateCount6m / input.dueCount6m >= 0.5)
		return {
			watch: true,
			reason: `Late on ${input.lateCount6m} of the last ${input.dueCount6m} charges.`
		};
	if ((daysSincePay ?? 999) >= 60)
		return {
			watch: true,
			reason: `Balance outstanding with no payment in ${daysSincePay ?? '60+'} days.`
		};
	return { watch: false, reason: '' };
}
