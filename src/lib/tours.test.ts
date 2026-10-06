import { describe, expect, it } from 'vitest';
import { isBookable, localDate, slotsOn, TOUR_DEFAULTS, tourSlots, zonedToUtc } from './tours.ts';

const hours = { ...TOUR_DEFAULTS, timezone: 'America/Chicago', noticeHours: 0 };

describe('zonedToUtc', () => {
	it('converts wall-clock time in a zone to an instant', () => {
		// CDT is UTC-5 in July, CST is UTC-6 in January.
		expect(zonedToUtc('2026-07-01', 10 * 60, 'America/Chicago').toISOString()).toBe(
			'2026-07-01T15:00:00.000Z'
		);
		expect(zonedToUtc('2026-01-15', 10 * 60, 'America/Chicago').toISOString()).toBe(
			'2026-01-15T16:00:00.000Z'
		);
		expect(zonedToUtc('2026-07-01', 0, 'UTC').toISOString()).toBe('2026-07-01T00:00:00.000Z');
	});

	it('handles zones ahead of UTC across midnight', () => {
		expect(zonedToUtc('2026-07-01', 30, 'Asia/Tokyo').toISOString()).toBe(
			'2026-06-30T15:30:00.000Z'
		);
		expect(localDate(new Date('2026-06-30T15:30:00Z'), 'Asia/Tokyo')).toBe('2026-07-01');
	});
});

describe('slotsOn', () => {
	const wed = '2026-07-01';
	it('lists slots inside tour hours on tour days', () => {
		const slots = slotsOn(wed, hours, new Date('2026-06-01T00:00:00Z'), []);
		expect(slots).toHaveLength(16);
		expect(slots[0]!.toISOString()).toBe('2026-07-01T15:00:00.000Z');
		expect(slots.at(-1)!.toISOString()).toBe('2026-07-01T22:30:00.000Z');
	});

	it('skips days that are not tour days', () => {
		expect(slotsOn('2026-07-05', hours, new Date('2026-06-01T00:00:00Z'), [])).toEqual([]);
	});

	it('respects the booking notice', () => {
		const now = new Date('2026-07-01T14:10:00Z');
		const slots = slotsOn(wed, { ...hours, noticeHours: 2 }, now, []);
		expect(slots[0]!.toISOString()).toBe('2026-07-01T16:30:00.000Z');
	});

	it('drops slots that overlap busy tours', () => {
		const busy = [
			{ start: new Date('2026-07-01T15:15:00Z'), end: new Date('2026-07-01T15:45:00Z') }
		];
		const slots = slotsOn(wed, hours, new Date('2026-06-01T00:00:00Z'), busy).map((s) =>
			s.toISOString()
		);
		expect(slots).not.toContain('2026-07-01T15:00:00.000Z');
		expect(slots).not.toContain('2026-07-01T15:30:00.000Z');
		expect(slots).toContain('2026-07-01T16:00:00.000Z');
	});

	it('handles the spring-forward day without phantom slots', () => {
		const night = { ...hours, tourDays: [0], tourStart: 60, tourEnd: 4 * 60, slotMinutes: 60 };
		const slots = slotsOn('2026-03-08', night, new Date('2026-03-01T00:00:00Z'), []).map((s) =>
			s.toISOString()
		);
		// 2:00 AM doesn't exist; 1:00 CST, 3:00 CDT.
		expect(slots).toEqual(['2026-03-08T07:00:00.000Z', '2026-03-08T08:00:00.000Z']);
	});
});

describe('tourSlots / isBookable', () => {
	it('groups by local date and validates exact slot times', () => {
		const now = new Date('2026-06-29T12:00:00Z');
		const days = tourSlots(hours, now, [], 7);
		expect(days.map((d) => d.date)).not.toContain('2026-07-05');
		expect(days[0]!.date).toBe('2026-06-29');
		const slot = new Date(days[1]!.slots[2]!);
		expect(isBookable(hours, slot, now, [])).toBe(true);
		expect(isBookable(hours, new Date(slot.getTime() + 60_000), now, [])).toBe(false);
		expect(isBookable(hours, slot, now, [{ start: slot, end: new Date(slot.getTime() + 1) }])).toBe(
			false
		);
	});
});
