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
	/\b(overflowing|electrical (fire|shock)|tree (fell|through))\b/i
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
