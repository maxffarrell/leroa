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
