import { describe, expect, it } from 'vitest';
import {
	heuristicDelinquency,
	heuristicDigest,
	heuristicDocCategory,
	heuristicInsights,
	heuristicIntake,
	heuristicLeadScore,
	heuristicLeaseExtract,
	heuristicListingCopy,
	heuristicMessageClass,
	heuristicReply,
	heuristicReportSummary,
	heuristicTenantSummary,
	heuristicTriage,
	heuristicVendorPick
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
<<<<<<< HEAD

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

describe('heuristicDocCategory', () => {
	it('maps filenames and content types to categories', () => {
		expect(heuristicDocCategory('signed lease 2026.pdf', 'application/pdf')).toBe('lease');
		expect(heuristicDocCategory('ACME COI certificate.pdf', 'application/pdf')).toBe('insurance');
		expect(heuristicDocCategory('w9-vendor.pdf', 'application/pdf')).toBe('tax');
		expect(heuristicDocCategory('inv_1042.pdf', 'application/pdf')).toBe('invoice');
		expect(heuristicDocCategory('move-in checklist.pdf', 'application/pdf')).toBe('inspection');
		expect(heuristicDocCategory('IMG_1234.jpg', 'image/jpeg')).toBe('photo');
		expect(heuristicDocCategory('random notes.txt', 'text/plain')).toBe('other');
	});
});

describe('heuristicTenantSummary', () => {
	const base = {
		name: 'Maya Chen',
		leases: [
			{
				status: 'active',
				propertyName: 'Maple Court',
				unitName: '101',
				endDate: '2027-04-30',
				balance: 0,
				rentAmount: 145000,
				currency: 'USD'
			}
		],
		ticketCount: 1,
		openTickets: 0,
		paymentsLast12m: 10
	};
	it('summarizes a current tenant with no flags', () => {
		const s = heuristicTenantSummary(base);
		expect(s.summary).toContain('Maple Court');
		expect(s.summary).toContain('current');
		expect(s.flags).toEqual([]);
	});
	it('flags balance and expiring lease', () => {
		const soon = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
		const s = heuristicTenantSummary({
			...base,
			leases: [{ ...base.leases[0]!, balance: 300000, endDate: soon }]
		});
		expect(s.flags).toContain('Carries a balance');
		expect(s.flags.some((f) => f.includes('renewal'))).toBe(true);
	});
});

describe('heuristicReportSummary', () => {
	it('names the worst offender', () => {
		const s = heuristicReportSummary({
			title: 'Delinquency',
			subtitle: 'x',
			columns: [
				{ key: 'tenant', label: 'Tenant' },
				{ key: 'balance', label: 'Balance', type: 'money' }
			],
			rows: [
				{ tenant: 'A', balance: 100 },
				{ tenant: 'B', balance: 900 },
				{ tenant: 'C', balance: 50 }
			],
			totals: { balance: 1050 }
		});
		expect(s.summary).toContain('Delinquency');
		expect(s.flags[0]).toContain('B');
	});
});

describe('heuristicVendorPick', () => {
	const vendors = [
		{
			id: '1',
			name: 'Ace Plumbing',
			trades: ['plumbing'],
			jobsCompleted: 4,
			avgCost: 20000,
			insuranceExpiresOn: null
		},
		{
			id: '2',
			name: 'Best Electric',
			trades: ['electrical'],
			jobsCompleted: 9,
			avgCost: 15000,
			insuranceExpiresOn: '2030-01-01'
		}
	];
	it('picks the trade-matching vendor', () => {
		const pick = heuristicVendorPick({ vendors, trade: 'electrical' });
		expect(pick?.vendorId).toBe('2');
	});
	it('skips vendors with expired insurance', () => {
		const pick = heuristicVendorPick({
			vendors: vendors.map((v) => ({ ...v, insuranceExpiresOn: '2020-01-01' })),
			trade: 'electrical'
		});
		expect(pick).toBeNull();
	});
});

describe('heuristicDigest', () => {
	it('lists actionable items', () => {
		const d = heuristicDigest({
			orgName: 'Sunrise',
			paymentsCount: 2,
			paymentsTotal: 300000,
			currency: 'USD',
			newTickets: [{ number: 7, title: 'Leak', priority: 'urgent' }],
			closedTickets: 1,
			expiringLeases: [{ tenant: 'Maya', unit: '101', endDate: '2026-11-01' }],
			expiringCois: [],
			newLeads: 0
		});
		expect(d.subject).toContain('Sunrise');
		expect(d.lines.join(' ')).toContain('#7');
		expect(d.lines.join(' ')).toContain('urgent');
	});
	it('handles a quiet day', () => {
		const d = heuristicDigest({
			orgName: 'Sunrise',
			paymentsCount: 0,
			paymentsTotal: 0,
			currency: null,
			newTickets: [],
			closedTickets: 0,
			expiringLeases: [],
			expiringCois: [],
			newLeads: 0
		});
		expect(d.lines).toEqual([]);
		expect(d.intro).toContain('Quiet day');
	});
});

describe('heuristicIntake', () => {
	it('escalates emergencies with a reason', () => {
		const d = heuristicIntake({
			title: 'Gas smell in the hallway',
			candidates: []
		});
		expect(d.emergency).toBe(true);
		expect(d.reason).toContain('emergency');
		expect(d.duplicateOf).toBeNull();
	});

	it('spots a near-duplicate open request', () => {
		const d = heuristicIntake({
			title: 'Kitchen sink is leaking again',
			description: 'Water dripping under the cabinet',
			candidates: [
				{ id: 't1', title: 'Leaking kitchen sink', description: 'Drip under the cabinet' },
				{ id: 't2', title: 'Replace bedroom blinds' }
			]
		});
		expect(d.emergency).toBe(false);
		expect(d.duplicateOf).toBe('t1');
	});

	it('does not flag different problems as duplicates', () => {
		const d = heuristicIntake({
			title: 'Bedroom window stuck shut',
			candidates: [{ id: 't1', title: 'Kitchen faucet drips' }]
		});
		expect(d.duplicateOf).toBeNull();
	});
});

describe('heuristicLeadScore', () => {
	it('scores an urgent, reachable applicant hot', () => {
		const s = heuristicLeadScore({
			email: 'a@b.c',
			phone: '555-1234',
			moveInDate: '2026-11-01',
			today: '2026-10-15',
			listingTitle: 'Maple Court 3B',
			source: 'application',
			message: 'Ready to sign ASAP'
		});
		expect(s.score).toBe('hot');
		expect(s.reason.length).toBeGreaterThan(0);
	});

	it('scores a thin inquiry cold', () => {
		const s = heuristicLeadScore({ email: 'a@b.c', source: 'website' });
		expect(s.score).toBe('cold');
	});

	it('scores a warm middle ground', () => {
		const s = heuristicLeadScore({
			email: 'a@b.c',
			source: 'listing',
			listingTitle: 'Elm House 1',
			moveInDate: '2027-03-01',
			today: '2026-10-15'
		});
		expect(s.score).toBe('warm');
	});
});

describe('heuristicMessageClass', () => {
	it('categorizes payment and maintenance messages', () => {
		expect(heuristicMessageClass('Why is there a late fee on my rent?').category).toBe('payment');
		expect(heuristicMessageClass('The bathroom sink keeps leaking').category).toBe('maintenance');
		expect(heuristicMessageClass('Can I renew my lease early?').category).toBe('lease');
		expect(heuristicMessageClass('Happy holidays!').category).toBe('other');
	});

	it('marks emergency wording urgent', () => {
		expect(heuristicMessageClass('There is water pouring through my ceiling').urgent).toBe(true);
		expect(heuristicMessageClass('The sink drips sometimes').urgent).toBe(false);
	});
});

describe('heuristicDelinquency', () => {
	it('watches a lease owing two-plus months', () => {
		const d = heuristicDelinquency({
			balanceCents: 340000,
			monthlyRentCents: 145000,
			lateCount6m: 1,
			dueCount6m: 6,
			lastPaymentAt: '2026-08-01',
			today: '2026-10-15'
		});
		expect(d.watch).toBe(true);
		expect(d.reason).toContain('months');
	});

	it('watches a mostly-late payer', () => {
		const d = heuristicDelinquency({
			balanceCents: 145000,
			monthlyRentCents: 145000,
			lateCount6m: 4,
			dueCount6m: 6,
			lastPaymentAt: '2026-10-10',
			today: '2026-10-15'
		});
		expect(d.watch).toBe(true);
		expect(d.reason).toContain('Late on 4');
	});

	it('ignores a lease with no balance', () => {
		expect(
			heuristicDelinquency({
				balanceCents: 0,
				monthlyRentCents: 145000,
				lateCount6m: 6,
				dueCount6m: 6,
				lastPaymentAt: '2026-01-01'
			}).watch
		).toBe(false);
	});
});
