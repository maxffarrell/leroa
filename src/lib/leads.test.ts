import { describe, expect, it } from 'vitest';
import { advanceStage, followUpState, matchesWaitlist } from './leads.ts';

describe('advanceStage', () => {
	it('only moves forward', () => {
		expect(advanceStage('new', 'contacted')).toBe('contacted');
		expect(advanceStage('touring', 'contacted')).toBe('touring');
		expect(advanceStage('contacted', 'applied')).toBe('applied');
	});
	it('never reopens closed leads', () => {
		expect(advanceStage('lost', 'touring')).toBe('lost');
		expect(advanceStage('leased', 'applied')).toBe('leased');
	});
	it('can close an open lead as leased', () => {
		expect(advanceStage('applied', 'leased')).toBe('leased');
	});
});

describe('matchesWaitlist', () => {
	const home = { propertyId: 'p1', bedrooms: 2 };
	it('matches unset preferences', () => {
		expect(matchesWaitlist({ propertyId: null, bedrooms: null }, home)).toBe(true);
	});
	it('filters by property and minimum bedrooms', () => {
		expect(matchesWaitlist({ propertyId: 'p2', bedrooms: null }, home)).toBe(false);
		expect(matchesWaitlist({ propertyId: 'p1', bedrooms: 3 }, home)).toBe(false);
		expect(matchesWaitlist({ propertyId: 'p1', bedrooms: 2 }, home)).toBe(true);
		expect(matchesWaitlist({ propertyId: null, bedrooms: 1 }, home)).toBe(true);
	});
	it('keeps homes with unknown size', () => {
		expect(
			matchesWaitlist({ propertyId: null, bedrooms: 3 }, { propertyId: 'p1', bedrooms: null })
		).toBe(true);
	});
});

describe('followUpState', () => {
	it('compares against today', () => {
		expect(followUpState(null, '2026-07-01')).toBeNull();
		expect(followUpState('2026-06-30', '2026-07-01')).toBe('overdue');
		expect(followUpState('2026-07-01', '2026-07-01')).toBe('today');
		expect(followUpState('2026-07-02', '2026-07-01')).toBe('upcoming');
	});
});
