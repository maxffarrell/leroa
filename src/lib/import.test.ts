import { describe, expect, it } from 'vitest';
import { autoMap, parseDate, parseMoney, splitName, splitResidents } from './import.ts';

describe('autoMap', () => {
	it('matches headers and aliases case- and punctuation-insensitively', () => {
		const m = autoMap(
			[
				'Property Name',
				'Unit #',
				'Resident',
				'Lease From',
				'Lease To',
				'Market Rent',
				'Rent',
				'E-mail'
			],
			'leases'
		);
		expect(m).toMatchObject({
			property: 0,
			unit: 1,
			name: 2,
			startDate: 3,
			endDate: 4,
			rent: 6,
			email: 7
		});
		expect(autoMap(['Unit No', 'Building'], 'units')).toMatchObject({ unit: 0, property: 1 });
	});
});

describe('parseMoney', () => {
	it('reads common formats as cents', () => {
		expect(parseMoney('$1,234.50')).toBe(123450);
		expect(parseMoney('1450')).toBe(145000);
		expect(parseMoney('1.234,50')).toBe(123450);
		expect(parseMoney('(25.00)')).toBe(-2500);
		expect(parseMoney('')).toBeNull();
		expect(() => parseMoney('twelve')).toThrow();
	});
});

describe('parseDate', () => {
	it('accepts ISO and US dates and rejects impossible ones', () => {
		expect(parseDate('2026-03-01')).toBe('2026-03-01');
		expect(parseDate('2026/3/1')).toBe('2026-03-01');
		expect(parseDate('3/1/2026')).toBe('2026-03-01');
		expect(parseDate('12/31/26')).toBe('2026-12-31');
		expect(parseDate('2026-01-01T00:00:00Z')).toBe('2026-01-01');
		expect(() => parseDate('2026-02-30')).toThrow();
		expect(() => parseDate('31.12.2026')).toThrow();
		expect(parseDate(' ')).toBeNull();
	});
});

describe('names', () => {
	it('splits first/last and multiple residents', () => {
		expect(splitName('Smith, Jane')).toEqual({ firstName: 'Jane', lastName: 'Smith' });
		expect(splitName('Mary Ann Lee')).toEqual({ firstName: 'Mary Ann', lastName: 'Lee' });
		expect(splitResidents('Jane & John Smith')).toEqual([
			{ firstName: 'Jane', lastName: 'Smith' },
			{ firstName: 'John', lastName: 'Smith' }
		]);
		expect(splitResidents('Jane Smith; Ali Khan')).toEqual([
			{ firstName: 'Jane', lastName: 'Smith' },
			{ firstName: 'Ali', lastName: 'Khan' }
		]);
	});
});
