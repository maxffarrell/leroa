export const REPORT_KEYS = [
	'rent-roll',
	'occupancy',
	'delinquency',
	'expiring-leases',
	'collections',
	'maintenance'
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export type ColumnType = 'text' | 'money' | 'date' | 'number' | 'percent';
export type ReportColumn = {
	key: string;
	label: string;
	type?: ColumnType;
	/** Summed into the totals row. */
	total?: boolean;
	/** Hidden below the `sm` breakpoint (still exported). */
	secondary?: boolean;
};
export type ReportValue = string | number | null;
export type ReportRow = Record<string, ReportValue>;
export type ReportResult = {
	key: ReportKey;
	title: string;
	subtitle: string;
	columns: ReportColumn[];
	rows: ReportRow[];
	/** Links each row to a record in the app (same order as `rows`). */
	links: (string | null)[];
	totals: ReportRow | null;
	/** Money columns are in this currency; null when rows mix currencies (no money totals). */
	currency: string | null;
};

export type ReportParam = 'days' | 'months' | 'range';

export const REPORTS: Record<
	ReportKey,
	{ title: string; description: string; param?: ReportParam }
> = {
	'rent-roll': {
		title: 'Rent roll',
		description: 'Every unit with its current resident, lease dates, rent, deposit and balance.'
	},
	occupancy: {
		title: 'Occupancy',
		description:
			'Occupied, vacant and on-notice units per property, and the rent vacant units could bring in.'
	},
	delinquency: {
		title: 'Delinquency',
		description: 'Unpaid balances per lease, split by how long they have been overdue.'
	},
	'expiring-leases': {
		title: 'Expiring leases',
		description: 'Leases ending soon and whether a renewal is lined up.',
		param: 'days'
	},
	collections: {
		title: 'Rent collection',
		description: 'Rent due against rent collected, month by month.',
		param: 'months'
	},
	maintenance: {
		title: 'Maintenance',
		description: 'Requests opened in a date range with status, vendor, time to close and cost.',
		param: 'range'
	}
};

export type ReportParams = {
	propertyId?: string | null;
	days?: number;
	months?: number;
	from?: string;
	to?: string;
};

/** Query string shared by the report page and its CSV download. */
export function reportQuery(p: ReportParams) {
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(p)) if (v != null && v !== '') q.set(k, String(v));
	return q.toString();
}
