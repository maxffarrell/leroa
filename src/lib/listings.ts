type UnitFacts = {
	bedrooms: number | null;
	bathrooms: number | null;
	areaSqft: number | null;
};

/** "2 bd · 1.5 ba · 850 sq ft", skipping unknown facts. Zero bedrooms reads as a studio. */
export function unitFacts(u: UnitFacts) {
	const parts: string[] = [];
	if (u.bedrooms === 0) parts.push('Studio');
	else if (u.bedrooms != null) parts.push(`${u.bedrooms} bd`);
	if (u.bathrooms != null) parts.push(`${u.bathrooms} ba`);
	if (u.areaSqft != null) parts.push(`${u.areaSqft.toLocaleString('en-US')} sq ft`);
	return parts.join(' · ');
}

export function defaultListingTitle(propertyName: string, unitName: string, u: UnitFacts) {
	const size = u.bedrooms === 0 ? 'Studio' : u.bedrooms != null ? `${u.bedrooms}-bedroom` : 'Home';
	return unitName === 'Main' || unitName === propertyName
		? `${size} at ${propertyName}`
		: `${size} at ${propertyName}, unit ${unitName}`;
}

/** `availableOn` is an ISO date; anything on or before `today` is available now. */
export function availability(availableOn: string | null, today: string) {
	if (!availableOn || availableOn <= today) return 'Available now';
	const d = new Date(`${availableOn}T00:00:00Z`);
	return `Available ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

export const AMENITY_SUGGESTIONS = [
	'In-unit laundry',
	'Dishwasher',
	'Air conditioning',
	'Parking',
	'Balcony',
	'Hardwood floors',
	'Gym',
	'Elevator',
	'Storage',
	'Outdoor space'
] as const;

/** Last day of a lease that starts on `start` and runs `months` months. */
export function leaseEndFor(start: string, months: number) {
	const d = new Date(`${start}T00:00:00Z`);
	const day = d.getUTCDate();
	d.setUTCDate(1);
	d.setUTCMonth(d.getUTCMonth() + months);
	const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
	d.setUTCDate(Math.min(day, last));
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}
