import { describe, expect, it } from 'vitest';
import { expandUnits } from './units.ts';

describe('expandUnits', () => {
	it('expands numeric ranges and keeps names', () => {
		expect(expandUnits('101-103, Penthouse')).toEqual(['101', '102', '103', 'Penthouse']);
	});
	it('keeps leading zeros and dedupes', () => {
		expect(expandUnits('01-03\n02')).toEqual(['01', '02', '03']);
	});
	it('treats reversed ranges as a literal name', () => {
		expect(expandUnits('5-1')).toEqual(['5-1']);
	});
});
