import type { OrgContext } from '#lib/server/context.ts';
import { createVendor } from './vendors.ts';
import { db } from '#lib/server/db/index.ts';
import { and, eq, inArray } from 'drizzle-orm';
import { inspectionItem, rentalApplication, ticketNote, user } from '#lib/server/db/schema.ts';
import { completeInspection, createInspection } from './inspections.ts';
import { addDays, monthKey, todayISO } from '#lib/format.ts';
import { createProperty, createTenant, getProperty, updateUnit } from './portfolio.ts';
import { createListing, setListingStatus, updateListing } from './listings.ts';
import { createLease, recordPayment, rentRoll } from './leasing.ts';
import { createTicket } from './maintenance.ts';
import { createAnnouncement, postMessage } from './messaging.ts';

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
	const tenants = [];
	for (const [i, [firstName, lastName]] of people.entries()) {
		const unit = units[i]!;
		const tenant = await createTenant(ctx, {
			kind: 'person',
			firstName,
			lastName,
			email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
			phone: `(512) 555-01${String(i).padStart(2, '0')}`
		});
		tenants.push(tenant);
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
	await loadDemoInspections(ctx, leases[0]!, leases[1]!, start);
	await loadDemoListings(ctx, units.slice(people.length));
	await loadDemoMessages(ctx, tenants, maple.id);
	return { properties: 3, leases: leases.length };
}

async function rate(
	inspectionId: string,
	area: string,
	label: string,
	condition: 'fair' | 'poor' | 'damaged',
	notes: string
) {
	await db
		.update(inspectionItem)
		.set({ condition, notes })
		.where(
			and(
				eq(inspectionItem.inspectionId, inspectionId),
				eq(inspectionItem.area, area),
				eq(inspectionItem.label, label)
			)
		);
}

/** A completed move-in report on one lease and a routine walkthrough half done on another. */
async function loadDemoInspections(
	ctx: OrgContext,
	moveIn: { id: string; unitId: string },
	routine: { id: string; unitId: string },
	start: string
) {
	const mi = await createInspection(ctx, {
		unitId: moveIn.unitId,
		kind: 'move_in',
		leaseId: moveIn.id,
		scheduledFor: start
	});
	await db
		.update(inspectionItem)
		.set({ condition: 'good' })
		.where(eq(inspectionItem.inspectionId, mi.id));
	await rate(mi.id, 'Living room', 'Floor', 'fair', 'Light scratches by the balcony door.');
	await rate(mi.id, 'Kitchen', 'Stove & oven', 'fair', 'Front-left burner is slow to light.');
	await completeInspection(ctx, mi.id, 'Clean and ready for move-in. Two minor items noted.', {
		notify: false
	});

	const ri = await createInspection(ctx, {
		unitId: routine.unitId,
		kind: 'routine',
		leaseId: routine.id,
		scheduledFor: todayISO()
	});
	const first = await db
		.select({ id: inspectionItem.id })
		.from(inspectionItem)
		.where(eq(inspectionItem.inspectionId, ri.id))
		.orderBy(inspectionItem.position)
		.limit(9);
	await db
		.update(inspectionItem)
		.set({ condition: 'good' })
		.where(
			inArray(
				inspectionItem.id,
				first.map((r) => r.id)
			)
		);
	await rate(ri.id, 'Bathroom', 'Exhaust fan', 'damaged', 'Fan rattles and barely pulls air.');
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

async function loadDemoMessages(
	ctx: OrgContext,
	tenants: { id: string; firstName: string; lastName: string }[],
	propertyId: string
) {
	const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, ctx.userId));
	const staff = { type: 'staff' as const, id: ctx.userId, name: me?.name || ctx.org.name };
	const resident = (t: { firstName: string; lastName: string }) => ({
		type: 'tenant' as const,
		id: null,
		name: `${t.firstName} ${t.lastName}`
	});
	const ago = (hours: number) => new Date(Date.now() - hours * 3600_000);
	const [maya, jordan] = tenants;
	await postMessage(
		ctx.orgId,
		maya!.id,
		resident(maya!),
		'Hi! Is it okay to keep a small grill on the balcony this summer?',
		ago(50)
	);
	await postMessage(
		ctx.orgId,
		maya!.id,
		staff,
		"Hi Maya, small electric grills are fine. Gas and charcoal grills aren't allowed on balconies under the fire code.",
		ago(49)
	);
	await postMessage(
		ctx.orgId,
		jordan!.id,
		resident(jordan!),
		"The package room keypad hasn't worked since this morning. Could someone take a look?",
		ago(3)
	);
	await createAnnouncement(ctx, {
		propertyId,
		subject: 'Water shut-off Tuesday, 9am to noon',
		body: 'The city is replacing the main valve on Maple Ave. Water will be off in all units on Tuesday from 9am to noon. Please plan ahead and keep a few bottles handy.',
		email: false
	});
}
