export type TourHours = {
	timezone: string;
	/** 0 = Sunday … 6 = Saturday. */
	tourDays: number[];
	/** Minutes after local midnight. */
	tourStart: number;
	tourEnd: number;
	slotMinutes: number;
	noticeHours: number;
};

export type Busy = { start: Date; end: Date };

export const TOUR_DEFAULTS: TourHours = {
	timezone: 'UTC',
	tourDays: [1, 2, 3, 4, 5, 6],
	tourStart: 10 * 60,
	tourEnd: 18 * 60,
	slotMinutes: 30,
	noticeHours: 12
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function isValidTimezone(tz: string) {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function parts(instant: Date, tz: string) {
	let f = partsCache.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		partsCache.set(tz, f);
	}
	const p = Object.fromEntries(f.formatToParts(instant).map((x) => [x.type, x.value]));
	return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour! % 24, min: +p.minute! };
}

/** Local wall-clock time minus UTC, in milliseconds, at `instant`. */
export function zoneOffset(instant: Date, tz: string) {
	const p = parts(instant, tz);
	const local = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
	return local - Math.floor(instant.getTime() / MINUTE) * MINUTE;
}

/** The instant at which the wall clock in `tz` reads `date` plus `minutes` after midnight. */
export function zonedToUtc(date: string, minutes: number, tz: string) {
	const guess = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE;
	const first = zoneOffset(new Date(guess), tz);
	let t = guess - first;
	const second = zoneOffset(new Date(t), tz);
	if (second !== first) t = guess - second;
	return new Date(t);
}

/** `YYYY-MM-DD` of `instant` on the wall clock in `tz`. */
export function localDate(instant: Date, tz: string) {
	const p = parts(instant, tz);
	return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const nextDate = (date: string) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + DAY).toISOString().slice(0, 10);

/** Open tour start times for one local date, skipping slots that overlap `busy`. */
export function slotsOn(date: string, hours: TourHours, now: Date, busy: Busy[]) {
	if (!hours.tourDays.includes(weekday(date))) return [];
	const earliest = now.getTime() + hours.noticeHours * 60 * MINUTE;
	const out: Date[] = [];
	const step = Math.max(15, hours.slotMinutes);
	for (let m = hours.tourStart; m + step <= hours.tourEnd; m += step) {
		const start = zonedToUtc(date, m, hours.timezone);
		// Skips wall-clock times that don't exist on the spring-forward day.
		const local = parts(start, hours.timezone);
		if (localDate(start, hours.timezone) !== date || local.h * 60 + local.min !== m) continue;
		if (start.getTime() < earliest) continue;
		const end = start.getTime() + step * MINUTE;
		if (busy.some((b) => b.start.getTime() < end && b.end.getTime() > start.getTime())) continue;
		out.push(start);
	}
	return out;
}

/** Bookable tour times for the next `days` local days, grouped by date. Empty days are dropped. */
export function tourSlots(hours: TourHours, now: Date, busy: Busy[], days = 14) {
	const out: { date: string; slots: string[] }[] = [];
	let date = localDate(now, hours.timezone);
	for (let i = 0; i < days; i++, date = nextDate(date)) {
		const slots = slotsOn(date, hours, now, busy);
		if (slots.length) out.push({ date, slots: slots.map((s) => s.toISOString()) });
	}
	return out;
}

export function isBookable(hours: TourHours, startsAt: Date, now: Date, busy: Busy[]) {
	const date = localDate(startsAt, hours.timezone);
	return slotsOn(date, hours, now, busy).some((s) => s.getTime() === startsAt.getTime());
}

/** "Tue, Oct 6, 2:30 PM" in `tz`. */
export function formatTourTime(instant: Date | string, tz?: string, withDate = true) {
	return new Date(instant).toLocaleString('en-US', {
		timeZone: tz,
		...(withDate ? { weekday: 'short', month: 'short', day: 'numeric' } : {}),
		hour: 'numeric',
		minute: '2-digit'
	});
}

/** "Tue, Oct 6, 2:30 PM CDT", for emails where the reader's zone is unknown. */
export function formatTourTimeZoned(instant: Date | string, tz: string) {
	return new Date(instant).toLocaleString('en-US', {
		timeZone: tz,
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	});
}

/** "10:00 AM" for minutes after midnight. */
export function formatMinutes(minutes: number) {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
