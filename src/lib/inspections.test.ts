import { describe, expect, it } from 'vitest';
import { defaultChecklist, groupByArea, matchKey, worsened } from './inspections.ts';

describe('defaultChecklist', () => {
	it('sizes bedrooms and bathrooms to the unit', () => {
		const areas = groupByArea(defaultChecklist({ bedrooms: 2, bathrooms: 1.5 })).map((g) => g.area);
		expect(areas).toEqual([
			'Entry',
			'Living room',
			'Kitchen',
			'Bedroom 1',
			'Bedroom 2',
			'Bathroom 1',
			'Bathroom 2',
			'General'
		]);
	});

	it('treats 0 bedrooms as a studio and defaults unknown sizes to one room', () => {
		const studio = groupByArea(defaultChecklist({ bedrooms: 0, bathrooms: 1 })).map((g) => g.area);
		expect(studio).not.toContain('Bedroom');
		const unknown = groupByArea(defaultChecklist({ bedrooms: null, bathrooms: null })).map(
			(g) => g.area
		);
		expect(unknown).toContain('Bedroom');
		expect(unknown).toContain('Bathroom');
	});
});

describe('worsened', () => {
	it('flags items in worse condition than before', () => {
		expect(worsened('good', 'damaged')).toBe(true);
		expect(worsened('fair', 'fair')).toBe(false);
		expect(worsened('poor', 'good')).toBe(false);
	});

	it('ignores unrated and N/A items', () => {
		expect(worsened(null, 'damaged')).toBe(false);
		expect(worsened('good', 'na')).toBe(false);
		expect(worsened('na', 'poor')).toBe(false);
	});
});

describe('matchKey', () => {
	it('matches items across inspections regardless of case and spacing', () => {
		expect(matchKey({ area: 'Kitchen ', label: 'Sink & Faucet' })).toBe(
			matchKey({ area: 'kitchen', label: 'sink & faucet' })
		);
	});
});
