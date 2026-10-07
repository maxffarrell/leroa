import { addDays } from './format.ts';

export const PM_INTERVALS = ['weeks', 'months', 'years'] as const;
export type PmInterval = (typeof PM_INTERVALS)[number];

const fromISO = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Adds `n` × `interval` to an ISO date. Months land on the same day or the
 * month's last day; once a run clamps into a short month it stays clamped
 * (Jan 31 + 2mo → Mar 28, not Mar 31).
 */
export function addInterval(iso: string, n: number, interval: PmInterval) {
	const d = fromISO(iso);
	if (interval === 'weeks') {
		d.setUTCDate(d.getUTCDate() + n * 7);
	} else {
		const step = interval === 'years' ? 12 : 1;
		for (let i = 0; i < n; i++) {
			const nm = d.getUTCMonth() + step;
			const y = d.getUTCFullYear() + Math.floor(nm / 12);
			const m = ((nm % 12) + 12) % 12;
			d.setUTCFullYear(y, m, Math.min(d.getUTCDate(), daysInMonth(y, m)));
		}
	}
	return toISO(d);
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Is the schedule due to issue a work order today? (run date minus lead time has arrived) */
export function isDue(nextRunOn: string, leadDays: number, today: string) {
	return addDays(nextRunOn, -leadDays) <= today;
}

/**
 * Advances a run date by the interval until it's outside the lead window
 * (`isDue` is false for `today`). Returns null if it can't make progress.
 */
export function advanceNextRun(
	runOn: string,
	every: number,
	interval: PmInterval,
	leadDays: number,
	today: string
) {
	if (every < 1) return null;
	let next = runOn;
	let guard = 0;
	while (isDue(next, leadDays, today) && guard++ < 500) next = addInterval(next, every, interval);
	return guard >= 500 ? null : next;
}

const singular: Record<PmInterval, string> = { weeks: 'week', months: 'month', years: 'year' };

export function describeInterval(every: number, interval: PmInterval) {
	if (every === 1) return `Every ${singular[interval]}`;
	return `Every ${every} ${interval}`;
}
