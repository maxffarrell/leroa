export const LEAD_STAGES = ['new', 'contacted', 'touring', 'applied', 'leased', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const OPEN_LEAD_STAGES = ['new', 'contacted', 'touring', 'applied'] as const;

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
	new: 'New',
	contacted: 'Contacted',
	touring: 'Touring',
	applied: 'Applied',
	leased: 'Leased',
	lost: 'Lost'
};

export const LEAD_SOURCES = [
	'website',
	'listing',
	'application',
	'phone',
	'email',
	'walk_in',
	'referral',
	'listing_site',
	'api',
	'other'
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
	website: 'Website',
	listing: 'Listing page',
	application: 'Application',
	phone: 'Phone',
	email: 'Email',
	walk_in: 'Walk-in',
	referral: 'Referral',
	listing_site: 'Listing site',
	api: 'API',
	other: 'Other'
};

export const LEAD_NOTE_KINDS = ['note', 'call', 'email', 'text'] as const;
export const TOUR_KINDS = ['in_person', 'virtual', 'self_guided'] as const;
export const TOUR_STATUSES = ['scheduled', 'completed', 'no_show', 'cancelled'] as const;
export const TOUR_KIND_LABELS: Record<(typeof TOUR_KINDS)[number], string> = {
	in_person: 'In person',
	virtual: 'Virtual',
	self_guided: 'Self-guided'
};

export const isOpenStage = (s: LeadStage) => (OPEN_LEAD_STAGES as readonly string[]).includes(s);

/**
 * The stage an automatic event (logging a call, booking a tour, applying) moves a lead to. Only
 * ever moves forward through open stages, so it never reopens a leased or lost lead or undoes a
 * manual move further along.
 */
export function advanceStage(current: LeadStage, to: LeadStage): LeadStage {
	if (!isOpenStage(current)) return current;
	return LEAD_STAGES.indexOf(to) > LEAD_STAGES.indexOf(current) ? to : current;
}

/** Whether a waitlisted lead wants `home`. Unset preferences match anything. */
export function matchesWaitlist(
	lead: { propertyId: string | null; bedrooms: number | null },
	home: { propertyId: string; bedrooms: number | null }
) {
	if (lead.propertyId && lead.propertyId !== home.propertyId) return false;
	if (lead.bedrooms != null && home.bedrooms != null && home.bedrooms < lead.bedrooms) return false;
	return true;
}

export function followUpState(date: string | null, today: string) {
	if (!date) return null;
	return date < today ? 'overdue' : date === today ? 'today' : 'upcoming';
}

export const leadName = (l: { firstName: string; lastName: string }) =>
	`${l.firstName} ${l.lastName}`.trim();
