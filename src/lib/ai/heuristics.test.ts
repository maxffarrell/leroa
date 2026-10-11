import { describe, expect, it } from 'vitest';
import {
	heuristicInsights,
	heuristicLeaseExtract,
	heuristicListingCopy,
	heuristicReply,
	heuristicTriage
} from './heuristics.ts';

describe('heuristicTriage', () => {
	it('flags emergencies urgent with a trade', () => {
		const t = heuristicTriage({
			title: 'Water pouring through kitchen ceiling',
			description: 'The upstairs neighbor’s pipe burst',
			trades: ['Plumbing', 'HVAC']
		});
		expect(t.priority).toBe('urgent');
		expect(t.trade).toBe('Plumbing'); // matched against the org's real trades (case-preserved)
	});

	it('flags habitability issues high', () => {
		expect(heuristicTriage({ title: 'AC not working', description: 'It is 95°' }).priority).toBe(
			'high'
		);
		expect(heuristicTriage({ title: 'Front door lock broken' }).priority).toBe('high');
	});

	it('keeps cosmetic work low and routine work normal', () => {
		expect(heuristicTriage({ title: 'Paint scuff in hallway' }).priority).toBe('low');
		expect(heuristicTriage({ title: 'Install shelf' }).priority).toBe('normal');
	});

	it('suggests known trades only, falling back to null', () => {
		expect(heuristicTriage({ title: 'Toilet keeps running', trades: [] }).trade).toBe('plumbing');
		expect(heuristicTriage({ title: 'Install shelf', trades: [] }).trade).toBeNull();
	});
});

describe('heuristicReply', () => {
	it('greets when there are no messages', () => {
		expect(heuristicReply({ tenantName: 'Pat Rivera', lastMessages: [] })).toContain('Hi Pat');
	});

	it('acknowledges a maintenance ask', () => {
		const reply = heuristicReply({
			tenantName: 'Pat Rivera',
			lastMessages: [
				{ authorType: 'staff', body: 'Welcome aboard!' },
				{ authorType: 'tenant', body: 'The bathroom sink is leaking badly' }
			]
		});
		expect(reply).toContain('maintenance request');
	});

	it('acknowledges a payment ask without promising outcomes', () => {
		const reply = heuristicReply({
			tenantName: 'Sam',
			lastMessages: [{ authorType: 'tenant', body: 'Why is there a late fee on my account?' }]
		});
		expect(reply).toContain('charge');
	});
});

describe('heuristicListingCopy', () => {
	it('describes the home only — no fair-housing tripwires', () => {
		const copy = heuristicListingCopy({
			propertyName: 'Maple Court',
			unitName: '3B',
			bedrooms: 2,
			bathrooms: 1,
			rentAmount: 145000,
			amenities: ['In-unit laundry', 'Private balcony', 'Dishwasher'],
			availableOn: '2026-11-01'
		});
		expect(copy.title).toContain('2-bedroom');
		expect(copy.title).toContain('Maple Court');
		expect(copy.description).toContain('In-unit laundry');
		expect(copy.description).toContain('Available November 1');
		expect(copy.description).not.toMatch(/perfect for|ideal for|singles|family|kids|couples/i);
	});

	it('handles sparse data', () => {
		const copy = heuristicListingCopy({ propertyName: 'Elm House', unitName: '1' });
		expect(copy.title).toContain('Elm House');
		expect(copy.description).toContain('Available now');
	});
});

describe('heuristicLeaseExtract', () => {
	const SAMPLE = `
		RESIDENTIAL LEASE AGREEMENT
		This lease is between Maple Properties LLC and Jordan Reyes.
		Tenant: Jordan Reyes and Sam Chen
		The term shall commence on January 1, 2026 and terminate on December 31, 2026.
		Monthly rent of $1,850.00 is due on the 1st.
		A security deposit of $1,850 shall be held.
	`;

	it('extracts tenants, dates, rent and deposit', () => {
		const r = heuristicLeaseExtract(SAMPLE);
		expect(r.startDate).toBe('2026-01-01');
		expect(r.endDate).toBe('2026-12-31');
		expect(r.rentAmount).toBe(185000);
		expect(r.depositAmount).toBe(185000);
		expect(r.tenants).toContain('Jordan Reyes');
		expect(r.tenants).toContain('Sam Chen');
	});

	it('returns nulls for empty text', () => {
		const r = heuristicLeaseExtract('no lease here');
		expect(r.startDate).toBeNull();
		expect(r.tenants).toEqual([]);
	});
});

describe('heuristicInsights', () => {
	const base = {
		overdueCount: 0,
		overdueAmount: 0,
		collectedPct: 100,
		expiringLeases: 0,
		soonestExpiryDays: null,
		openTickets: 0,
		urgentTickets: 0,
		expiringVendorInsurance: 0,
		vacantUnits: 0,
		leadsNeedingAttention: 0,
		openTurns: 0
	};

	it('returns empty when nothing needs attention', () => {
		expect(heuristicInsights(base)).toEqual([]);
	});

	it('surfaces overdue rent first and caps at 4', () => {
		const out = heuristicInsights({
			...base,
			overdueCount: 3,
			overdueAmount: 430000,
			expiringLeases: 2,
			urgentTickets: 1,
			expiringVendorInsurance: 1,
			vacantUnits: 2,
			openTurns: 1
		});
		expect(out.length).toBe(4);
		expect(out[0].href).toBe('/rent');
		expect(out[0].title).toContain('3');
	});
});
