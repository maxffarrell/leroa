import type { OrgContext } from '#lib/server/context.ts';
import { monthKey } from '#lib/format.ts';
import { createProperty, createTenant, getProperty } from './portfolio.ts';
import { createLease, recordPayment, rentRoll } from './leasing.ts';
import { createTicket } from './maintenance.ts';

const people = [
	['Maya', 'Chen'],
	['Jordan', 'Brooks'],
	['Priya', 'Natarajan'],
	['Luis', 'Ortega'],
	['Hannah', 'Kim'],
	['Omar', 'Haddad'],
	['Grace', 'Okafor'],
	['Ethan', 'Walsh'],
	['Sofia', 'Rossi'],
	['Daniel', 'Park']
] as const;

/** Fills an empty workspace with a realistic portfolio so new users can explore. */
export async function loadDemoData(ctx: OrgContext) {
	const maple = await createProperty(ctx, {
		name: 'Maple Court',
		type: 'multi_family',
		addressLine1: '1420 Maple Ave',
		city: 'Austin',
		region: 'TX',
		postalCode: '78702',
		country: 'US',
		units: ['101', '102', '103', '104', '201', '202', '203', '204']
	});
	const harbor = await createProperty(ctx, {
		name: 'Harbor Lofts',
		type: 'multi_family',
		addressLine1: '88 Water St',
		city: 'Austin',
		region: 'TX',
		postalCode: '78701',
		country: 'US',
		units: ['A', 'B', 'C', 'D']
	});
	const cedar = await createProperty(ctx, {
		name: '17 Cedar Lane',
		type: 'single_family',
		addressLine1: '17 Cedar Ln',
		city: 'Round Rock',
		region: 'TX',
		postalCode: '78664',
		country: 'US',
		units: ['Main']
	});

	const units = [
		...(await getProperty(ctx.orgId, maple.id)).units,
		...(await getProperty(ctx.orgId, harbor.id)).units,
		...(await getProperty(ctx.orgId, cedar.id)).units
	];
	const today = new Date();
	const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1))
		.toISOString()
		.slice(0, 10);
	const month = monthKey();

	const leases = [];
	for (const [i, [firstName, lastName]] of people.entries()) {
		const unit = units[i]!;
		const tenant = await createTenant(ctx, {
			kind: 'person',
			firstName,
			lastName,
			email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
			phone: `(512) 555-01${String(i).padStart(2, '0')}`
		});
		const rent = 145000 + (i % 4) * 15000;
		const end = new Date(
			Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + (i === 2 ? 1 : 7 + i), 0)
		)
			.toISOString()
			.slice(0, 10);
		leases.push(
			await createLease(ctx, {
				unitId: unit.id,
				tenantIds: [tenant.id],
				status: 'active',
				startDate: start,
				endDate: end,
				rentAmount: rent,
				depositAmount: rent,
				rentDueDay: 1,
				frequency: 'monthly',
				lateFeeAmount: 0,
				lateFeeGraceDays: 5,
				currency: 'USD'
			})
		);
	}

	for (let m = 5; m >= 0; m--) {
		const key = monthKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1)));
		const roll = await rentRoll(ctx.orgId, key);
		for (const [i, c] of roll.entries()) {
			if (c.kind !== 'rent') continue;
			if (key === month && i % 3 === 0) continue;
			const amount = key === month && i === 4 ? Math.round(c.amount / 2) : c.amount;
			const day = Math.min(28, 1 + (i % 5));
			await recordPayment(ctx, {
				leaseId: c.leaseId,
				chargeId: c.id,
				amount,
				receivedOn: `${key}-${String(day).padStart(2, '0')}`,
				method: i % 2 ? 'ach' : 'check',
				reference: null,
				notes: null
			});
		}
	}

	const tickets: [
		string,
		string,
		'low' | 'normal' | 'high' | 'urgent',
		'open' | 'in_progress' | 'on_hold' | 'done'
	][] = [
		[maple.id, 'Water heater not working', 'urgent', 'open'],
		[maple.id, 'Replace hallway light fixtures', 'low', 'open'],
		[harbor.id, 'Dishwasher leaking', 'high', 'in_progress'],
		[cedar.id, 'Gutter cleaning', 'normal', 'on_hold'],
		[maple.id, 'Repaint unit 104 after move-out', 'normal', 'done']
	];
	for (const [propertyId, title, priority, status] of tickets) {
		await createTicket(ctx, {
			propertyId,
			unitId: null,
			tenantId: null,
			title,
			description: null,
			priority,
			status,
			assigneeId: null,
			vendor: null,
			dueDate: null
		});
	}
	return { properties: 3, leases: leases.length };
}
