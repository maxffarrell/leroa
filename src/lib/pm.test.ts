import { describe, expect, it } from 'vitest';
import { addInterval, advanceNextRun, describeInterval, isDue } from './pm.ts';

describe('addInterval', () => {
	it('adds weeks', () => {
		expect(addInterval('2026-01-05', 2, 'weeks')).toBe('2026-01-19');
	});
	it('adds months on the same day', () => {
		expect(addInterval('2026-01-15', 3, 'months')).toBe('2026-04-15');
	});
	it('clamps at the end of short months', () => {
		expect(addInterval('2026-01-31', 1, 'months')).toBe('2026-02-28');
		expect(addInterval('2025-01-31', 1, 'months')).toBe('2025-02-28');
		expect(addInterval('2024-01-31', 1, 'months')).toBe('2024-02-29');
	});
	it('clamping does not drift across iterations', () => {
		// Jan 31 → Feb 28, then Feb 28 + 1mo stays Mar 28 (clamped day wins).
		expect(addInterval('2026-01-31', 2, 'months')).toBe('2026-03-28');
	});
	it('adds years across leap day', () => {
		// Feb 29 clamps to Feb 28 in non-leap years.
		expect(addInterval('2024-02-29', 1, 'years')).toBe('2025-02-28');
		expect(addInterval('2026-03-10', 5, 'years')).toBe('2031-03-10');
	});
	it('crosses year boundaries', () => {
		expect(addInterval('2026-12-15', 2, 'months')).toBe('2027-02-15');
		expect(addInterval('2026-12-20', 2, 'weeks')).toBe('2027-01-03');
	});
});

describe('advanceNextRun', () => {
	it('returns the same date when not due', () => {
		expect(advanceNextRun('2026-02-01', 1, 'months', 7, '2026-01-15')).toBe('2026-02-01');
	});
	it('steps once when due within the lead window', () => {
		expect(advanceNextRun('2026-01-15', 1, 'months', 7, '2026-01-10')).toBe('2026-02-15');
	});
	it('catches up missed runs', () => {
		expect(advanceNextRun('2026-01-01', 1, 'months', 0, '2026-03-20')).toBe('2026-04-01');
		expect(advanceNextRun('2026-01-05', 1, 'weeks', 0, '2026-01-20')).toBe('2026-01-26');
	});
	it('accounts for the lead window when catching up', () => {
		// Jan 29 was due Jan 22 → next is Feb 28, whose lead window (Feb 21) is still ahead.
		expect(advanceNextRun('2026-01-29', 1, 'months', 7, '2026-02-19')).toBe('2026-02-28');
	});
	it('gives up on a zero interval', () => {
		expect(advanceNextRun('2026-01-01', 0, 'months', 0, '2026-02-01')).toBeNull();
	});
});

describe('isDue', () => {
	it('is due when next run minus lead days is today or past', () => {
		expect(isDue('2026-01-15', 7, '2026-01-08')).toBe(true);
		expect(isDue('2026-01-15', 7, '2026-01-15')).toBe(true);
		expect(isDue('2026-01-15', 7, '2026-01-07')).toBe(false);
	});
});

describe('describeInterval', () => {
	it('singular and plural', () => {
		expect(describeInterval(1, 'months')).toBe('Every month');
		expect(describeInterval(3, 'months')).toBe('Every 3 months');
		expect(describeInterval(2, 'weeks')).toBe('Every 2 weeks');
	});
});
