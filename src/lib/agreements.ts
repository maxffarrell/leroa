/** Merge fields available in lease templates, written as `{{field}}`. */
export const MERGE_FIELDS = [
	{ key: 'organization_name', label: 'Your company' },
	{ key: 'tenant_names', label: 'Tenant names' },
	{ key: 'property_name', label: 'Property' },
	{ key: 'property_address', label: 'Property address' },
	{ key: 'unit_name', label: 'Unit' },
	{ key: 'start_date', label: 'Start date' },
	{ key: 'end_date', label: 'End date' },
	{ key: 'rent_amount', label: 'Rent' },
	{ key: 'rent_frequency', label: 'Rent frequency' },
	{ key: 'rent_due_day', label: 'Rent due day' },
	{ key: 'deposit_amount', label: 'Deposit' },
	{ key: 'late_fee_amount', label: 'Late fee' },
	{ key: 'late_fee_grace_days', label: 'Grace days' },
	{ key: 'today', label: "Today's date" }
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number]['key'];
export type MergeValues = Record<MergeField, string>;

const FIELD = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Fills `{{field}}` placeholders. Unknown fields are left as written so they stand out. */
export function renderTemplate(body: string, values: Partial<MergeValues>) {
	const unknown = new Set<string>();
	const text = body.replace(FIELD, (match, key: string) => {
		const value = values[key as MergeField];
		if (value === undefined) {
			unknown.add(key);
			return match;
		}
		return value;
	});
	return { text, unknown: [...unknown] };
}

export const ordinal = (n: number) => {
	const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
	return `${n}${s}`;
};

export const STARTER_TEMPLATE = {
	name: 'Residential lease',
	body: `# Residential Lease Agreement

This lease is made on {{today}} between {{organization_name}} ("Landlord") and {{tenant_names}} ("Tenant").

# 1. Premises
Landlord rents to Tenant the residence at {{property_address}}, {{property_name}}, unit {{unit_name}} (the "Premises").

# 2. Term
The lease begins on {{start_date}} and ends on {{end_date}}. If no end date is given, the lease continues month to month until either party gives written notice as required by local law.

# 3. Rent
Tenant will pay {{rent_amount}} {{rent_frequency}}, due on the {{rent_due_day}} day of each period. Rent can be paid through the resident portal or any other method Landlord accepts in writing.

# 4. Late fees
If rent is not received within {{late_fee_grace_days}} days of the due date, a late fee of {{late_fee_amount}} applies, to the extent allowed by law.

# 5. Security deposit
Tenant has paid or will pay a security deposit of {{deposit_amount}}. Landlord will hold and return it as required by law, less lawful deductions.

# 6. Use and occupancy
The Premises may be used only as a private residence by the people named in this lease and their minor children.

# 7. Maintenance and repairs
Tenant will keep the Premises clean and report problems promptly through the resident portal. Landlord will make repairs needed to keep the Premises safe and habitable.

# 8. Entry
Landlord may enter the Premises for inspections, repairs or showings after giving the notice required by law, or at any time in an emergency.

# 9. Notices
Notices may be sent to Tenant through the resident portal or by email, and to Landlord through the contact details in the portal.

# 10. Entire agreement
This document is the entire agreement between the parties. Any change must be in writing and signed by both parties.

By signing electronically, each party agrees that their electronic signature is the legal equivalent of their handwritten signature.`
};
