import { describe, expect, it } from 'vitest';
import { availability, defaultListingTitle, leaseEndFor, unitFacts } from './listings.ts';

describe('unitFacts', () => {
	it('joins known facts', () => {
		expect(unitFacts({ bedrooms: 2, bathrooms: 1.5, areaSqft: 1250 })).toBe(
			'2 bd · 1.5 ba · 1,250 sq ft'
		);
	});
	it('calls zero bedrooms a studio and skips unknowns', () => {
		expect(unitFacts({ bedrooms: 0, bathrooms: null, areaSqft: null })).toBe('Studio');
		expect(unitFacts({ bedrooms: null, bathrooms: null, areaSqft: null })).toBe('');
	});
});

describe('defaultListingTitle', () => {
	it('includes the unit for multi-unit buildings', () => {
		expect(
			defaultListingTitle('Maple Court', '204', { bedrooms: 1, bathrooms: 1, areaSqft: null })
		).toBe('1-bedroom at Maple Court, unit 204');
	});
	it('drops the unit for single-family homes', () => {
		expect(
			defaultListingTitle('17 Cedar Lane', 'Main', {
				bedrooms: null,
				bathrooms: null,
				areaSqft: null
			})
		).toBe('Home at 17 Cedar Lane');
	});
});

describe('availability', () => {
	it('is available now for past, today or unset dates', () => {
		expect(availability(null, '2026-05-01')).toBe('Available now');
		expect(availability('2026-05-01', '2026-05-01')).toBe('Available now');
	});
	it('shows future dates', () => {
		expect(availability('2026-06-15', '2026-05-01')).toBe('Available Jun 15');
	});
});

describe('leaseEndFor', () => {
	it('ends the day before the same date n months later', () => {
		expect(leaseEndFor('2026-03-01', 12)).toBe('2027-02-28');
		expect(leaseEndFor('2026-01-15', 6)).toBe('2026-07-14');
	});
	it('clamps to short months', () => {
		expect(leaseEndFor('2026-01-31', 1)).toBe('2026-02-27');
	});
});
