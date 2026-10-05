import type { OrgContext } from '#lib/server/context.ts';
import { createVendor } from './vendors.ts';
import { db } from '#lib/server/db/index.ts';
import { rentalApplication, ticketNote } from '#lib/server/db/schema.ts';
import { addDays, monthKey, todayISO } from '#lib/format.ts';
import { createProperty, createTenant, getProperty, updateUnit } from './portfolio.ts';
import { createListing, setListingStatus, updateListing } from './listings.ts';
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

	const [plumber, electric, grounds] = await Promise.all(
		(
			[
				[
					'Rapid Plumbing',
					'Dana Ruiz',
					'dispatch@rapidplumbing.example',
					'(512) 555-0142',
					['Plumbing', 'Appliances'],
					210
				],
				[
					'Brightline Electric',
					'Sam Okafor',
					'jobs@brightline.example',
					'(512) 555-0178',
					['Electrical'],
					12
				],
				[
					'Evergreen Grounds',
					null,
					'hello@evergreen.example',
					'(512) 555-0110',
					['Landscaping', 'Painting', 'Cleaning'],
					-20
				]
			] as const
		).map(([name, contactName, email, phone, trades, days]) =>
			createVendor(ctx, {
				name,
				contactName,
				email,
				phone,
				trades: [...trades],
				notes: null,
				insuranceExpiresOn: addDays(todayISO(), days)
			})
		)
	);

	const tickets: [
		string,
		string,
		'low' | 'normal' | 'high' | 'urgent',
		'open' | 'in_progress' | 'on_hold' | 'done',
		string | null,
		number | null
	][] = [
		[maple.id, 'Water heater not working', 'urgent', 'open', plumber!.id, null],
		[maple.id, 'Replace hallway light fixtures', 'low', 'open', electric!.id, null],
		[harbor.id, 'Dishwasher leaking', 'high', 'in_progress', plumber!.id, null],
		[cedar.id, 'Gutter cleaning', 'normal', 'on_hold', grounds!.id, null],
		[maple.id, 'Repaint unit 104 after move-out', 'normal', 'done', grounds!.id, 68000]
	];
	for (const [propertyId, title, priority, status, vendorId, costAmount] of tickets) {
		const t = await createTicket(ctx, {
			propertyId,
			unitId: null,
			tenantId: null,
			title,
			description: null,
			priority,
			status,
			assigneeId: null,
			vendorId,
			costAmount,
			dueDate: null
		});
		if (title === 'Dishwasher leaking')
			await db.insert(ticketNote).values({
				organizationId: ctx.orgId,
				ticketId: t.id,
				authorType: 'vendor',
				vendorId: plumber!.id,
				authorName: plumber!.name,
				body: 'Drain hose is cracked. Replacement part arrives Thursday; I will be back then.'
			});
	}
	await loadDemoListings(ctx, units.slice(people.length));
	return { properties: 3, leases: leases.length };
}

const vacancies = [
	{
		bedrooms: 1,
		bathrooms: 1,
		areaSqft: 720,
		marketRent: 165000,
		description:
			'Bright corner loft with 12-foot ceilings, exposed brick and big east-facing windows. Two blocks from the river trail and a short walk to downtown.',
		amenities: ['In-unit laundry', 'Dishwasher', 'Air conditioning', 'Hardwood floors'],
		petPolicy: 'Cats and dogs under 40 lb welcome.',
		applicants: [
			[
				'Ava',
				'Thompson',
				'Riverside Dental',
				520000,
				1,
				'Looking to move in at the start of next month.'
			],
			['Noah', 'Patel', 'City of Austin', 610000, 2, null]
		]
	},
	{
		bedrooms: 2,
		bathrooms: 1,
		areaSqft: 940,
		marketRent: 198000,
		description:
			'Two-bedroom loft with an open kitchen, quartz counters and a private balcony overlooking Water Street.',
		amenities: ['Balcony', 'Dishwasher', 'Elevator', 'Parking'],
		petPolicy: null,
		applicants: [
			['Liam', 'Garcia', 'Austin Community College', 700000, 3, 'We have one small dog.']
		]
	},
	{
		bedrooms: 3,
		bathrooms: 2,
		areaSqft: 1480,
		marketRent: 245000,
		description:
			'Three-bedroom single-family home with a fenced backyard, two-car garage and updated kitchen, in a quiet Round Rock neighborhood.',
		amenities: ['Outdoor space', 'Parking', 'In-unit laundry', 'Storage'],
		petPolicy: 'Pets considered case by case.',
		applicants: []
	}
] as const;

async function loadDemoListings(ctx: OrgContext, vacant: { id: string }[]) {
	const today = todayISO();
	for (const [i, v] of vacancies.entries()) {
		const unit = vacant[i];
		if (!unit) break;
		await updateUnit(ctx, {
			id: unit.id,
			bedrooms: v.bedrooms,
			bathrooms: v.bathrooms,
			areaSqft: v.areaSqft,
			marketRent: v.marketRent
		});
		const { id } = await createListing(ctx, { unitId: unit.id });
		await updateListing(ctx, {
			id,
			description: v.description,
			amenities: [...v.amenities],
			petPolicy: v.petPolicy,
			availableOn: addDays(today, 7 + i * 10),
			leaseTermMonths: 12
		});
		// The last vacancy stays a draft so the editor has something to publish.
		if (i < vacancies.length - 1) await setListingStatus(ctx, { id, status: 'published' });
		for (const [
			j,
			[firstName, lastName, employer, income, occupants, message]
		] of v.applicants.entries()) {
			await db.insert(rentalApplication).values({
				organizationId: ctx.orgId,
				listingId: id,
				unitId: unit.id,
				status: j === 0 ? 'new' : 'reviewing',
				firstName,
				lastName,
				email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
				phone: `(512) 555-02${i}${j}`,
				moveInDate: addDays(today, 14 + j * 7),
				occupants,
				employer,
				monthlyIncome: income,
				message,
				consentAt: new Date()
			});
		}
	}
}
