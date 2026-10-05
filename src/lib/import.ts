import { toCsv } from './csv.ts';

export const IMPORT_KINDS = ['units', 'tenants', 'leases'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export type ImportField = {
	key: string;
	label: string;
	aliases: string[];
	example: string;
	required?: boolean;
};

const f = (
	key: string,
	label: string,
	aliases: string[],
	example: string,
	required = false
): ImportField => ({ key, label, aliases, example, required });

const property = f(
	'property',
	'Property',
	['property', 'propertyname', 'building', 'buildingname', 'community', 'site'],
	'Maple Court',
	true
);
const unit = f(
	'unit',
	'Unit',
	['unit', 'unitname', 'unitnumber', 'unitno', 'unitid', 'apt', 'apartment', 'suite', 'space'],
	'1A',
	true
);
const name = f(
	'name',
	'Full name',
	[
		'name',
		'fullname',
		'tenant',
		'tenants',
		'tenantname',
		'resident',
		'residents',
		'residentname',
		'lessee'
	],
	'Jane Smith'
);
const firstName = f('firstName', 'First name', ['firstname', 'first', 'givenname'], '');
const lastName = f('lastName', 'Last name', ['lastname', 'last', 'surname', 'familyname'], '');
const email = f('email', 'Email', ['email', 'emailaddress', 'mail'], 'jane@example.com');
const phone = f(
	'phone',
	'Phone',
	[
		'phone',
		'phonenumber',
		'mobile',
		'mobilephone',
		'cell',
		'cellphone',
		'phone1',
		'telephone',
		'tel'
	],
	'555-0100'
);

export const IMPORT_TYPES: Record<
	ImportKind,
	{ title: string; description: string; fields: ImportField[] }
> = {
	units: {
		title: 'Properties & units',
		description:
			'One row per unit. Properties are created the first time their name appears; existing units are updated.',
		fields: [
			property,
			f(
				'address',
				'Street address',
				['address', 'street', 'street1', 'addressline1', 'propertyaddress'],
				'12 Maple St'
			),
			f('city', 'City', ['city', 'town'], 'Portland'),
			f('region', 'State / region', ['state', 'region', 'province', 'county'], 'OR'),
			f('postalCode', 'ZIP / postcode', ['zip', 'zipcode', 'postcode', 'postalcode'], '97201'),
			f('country', 'Country (2 letters)', ['country', 'countrycode'], 'US'),
			unit,
			f('bedrooms', 'Bedrooms', ['bedrooms', 'beds', 'bed', 'bd', 'br'], '2'),
			f('bathrooms', 'Bathrooms', ['bathrooms', 'baths', 'bath', 'ba'], '1.5'),
			f(
				'sqft',
				'Square feet',
				['sqft', 'squarefeet', 'sqfeet', 'sf', 'area', 'size', 'areasqft'],
				'850'
			),
			f(
				'marketRent',
				'Market rent',
				['marketrent', 'askingrent', 'listrent', 'advertisedrent'],
				'1450'
			)
		]
	},
	tenants: {
		title: 'Tenants',
		description:
			'One row per person or company. Rows whose email (or exact name, when there is no email) matches an existing tenant are skipped.',
		fields: [
			name,
			firstName,
			lastName,
			f('company', 'Company', ['company', 'companyname', 'business', 'organization'], ''),
			email,
			phone,
			f('notes', 'Notes', ['notes', 'note', 'comments'], '')
		]
	},
	leases: {
		title: 'Leases (rent roll)',
		description:
			'One row per lease. Missing properties, units and tenants are created. Put several residents in one cell separated by “&” or “;”.',
		fields: [
			property,
			unit,
			name,
			firstName,
			lastName,
			email,
			phone,
			f(
				'startDate',
				'Lease start',
				[
					'startdate',
					'leasestart',
					'leasefrom',
					'leasestartdate',
					'start',
					'begindate',
					'movein',
					'moveindate',
					'from'
				],
				'2026-01-01',
				true
			),
			f(
				'endDate',
				'Lease end',
				[
					'enddate',
					'leaseend',
					'leaseto',
					'leaseenddate',
					'end',
					'leaseexpiration',
					'expiration',
					'expires',
					'to'
				],
				'2026-12-31'
			),
			f(
				'rent',
				'Monthly rent',
				['rent', 'monthlyrent', 'leaserent', 'rentamount', 'currentrent', 'actualrent'],
				'1450',
				true
			),
			f(
				'deposit',
				'Security deposit',
				['deposit', 'securitydeposit', 'depositamount', 'depositheld'],
				'1450'
			),
			f('dueDay', 'Rent due day', ['dueday', 'rentdueday', 'dayofmonth'], '1'),
			f(
				'balance',
				'Balance owed today',
				['balance', 'openingbalance', 'pastdue', 'amountowed', 'balancedue', 'arrears'],
				'0'
			)
		]
	}
};

const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Column index for each field, matched on header names and common aliases. */
export function autoMap(headers: string[], kind: ImportKind): Record<string, number | null> {
	const used = new Set<number>();
	const keys = headers.map(normalize);
	const mapping: Record<string, number | null> = {};
	for (const field of IMPORT_TYPES[kind].fields) {
		const want = [normalize(field.key), normalize(field.label), ...field.aliases];
		const i = keys.findIndex((k, i) => !used.has(i) && want.includes(k));
		mapping[field.key] = i === -1 ? null : i;
		if (i !== -1) used.add(i);
	}
	return mapping;
}

export function templateCsv(kind: ImportKind) {
	const fields = IMPORT_TYPES[kind].fields.filter((x) => x.example);
	return toCsv([fields.map((x) => x.label), fields.map((x) => x.example)]);
}

/** Amount in cents from "$1,234.50", "1234", "1.234,50"; null when blank. */
export function parseMoney(raw: string | undefined): number | null {
	const s = (raw ?? '').trim();
	if (!s || s === '-') return null;
	const negative = /^\(.*\)$/.test(s) || s.includes('-');
	let n = s.replace(/[^\d.,]/g, '');
	if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(n) || /^\d+,\d{1,2}$/.test(n))
		n = n.replaceAll('.', '').replace(',', '.');
	else n = n.replaceAll(',', '');
	if (!/^\d+(\.\d+)?$/.test(n)) throw new Error(`“${s}” isn't an amount`);
	const cents = Math.round(Number(n) * 100);
	return negative ? -cents : cents;
}

/** ISO date from YYYY-MM-DD, YYYY/MM/DD or US M/D/YYYY (or M/D/YY); null when blank. */
export function parseDate(raw: string | undefined): string | null {
	const s = (raw ?? '').trim();
	if (!s) return null;
	let y: number, m: number, d: number;
	let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s);
	if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
	else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s))) {
		[m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
		if (y < 100) y += 2000;
	} else throw new Error(`“${s}” isn't a date (use YYYY-MM-DD)`);
	const date = new Date(Date.UTC(y, m - 1, d));
	if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
		throw new Error(`“${s}” isn't a real date`);
	return date.toISOString().slice(0, 10);
}

export function parseNumber(raw: string | undefined): number | null {
	const s = (raw ?? '').trim().replaceAll(',', '');
	if (!s) return null;
	if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`“${raw}” isn't a number`);
	return Number(s);
}

export type PersonName = { firstName: string; lastName: string };

/** "Jane Smith", "Smith, Jane" → first/last. */
export function splitName(raw: string): PersonName {
	const s = raw.trim().replace(/\s+/g, ' ');
	const comma = /^([^,]+),\s*(.+)$/.exec(s);
	if (comma) return { firstName: comma[2]!, lastName: comma[1]! };
	const i = s.lastIndexOf(' ');
	return i === -1
		? { firstName: s, lastName: '' }
		: { firstName: s.slice(0, i), lastName: s.slice(i + 1) };
}

/** "Jane & John Smith", "Jane Smith; Ali Khan" → one name per resident. */
export function splitResidents(raw: string): PersonName[] {
	const parts = raw
		.split(/\s*(?:;|&|\band\b|\/)\s*/i)
		.map((p) => p.trim())
		.filter(Boolean);
	const names = parts.map(splitName);
	const surname = names.at(-1)?.lastName ?? '';
	return names.map((n) => (n.lastName ? n : { ...n, lastName: surname }));
}
