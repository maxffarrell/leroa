import { describe, expect, it } from 'vitest';
import { insuranceState } from './vendors.ts';

describe('insuranceState', () => {
	const today = '2026-10-04';
	it('flags missing, expired, expiring and current certificates', () => {
		expect(insuranceState(null, today)).toBe('missing');
		expect(insuranceState('2026-10-03', today)).toBe('expired');
		expect(insuranceState('2026-10-04', today)).toBe('expiring');
		expect(insuranceState('2026-11-03', today)).toBe('expiring');
		expect(insuranceState('2026-11-04', today)).toBe('ok');
	});
});
