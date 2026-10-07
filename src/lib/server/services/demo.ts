import type { OrgContext } from '#lib/server/context.ts';
import { createVendor } from './vendors.ts';
import { db } from '#lib/server/db/index.ts';
import { and, eq, inArray } from 'drizzle-orm';
import {
	inspectionItem,
	pmSchedule,
	rentalApplication,
	ticketNote,
	user
} from '#lib/server/db/schema.ts';
import { completeInspection, createInspection } from './inspections.ts';
import { addDays, addYears, monthKey, todayISO } from '#lib/format.ts';
import { createProperty, createTenant, getProperty, updateUnit } from './portfolio.ts';
import { createListing, setListingStatus, updateListing } from './listings.ts';
import { createLease, recordPayment, rentRoll } from './leasing.ts';
import { createTicket, updateTicket } from './maintenance.ts';
import { createAsset } from './assets.ts';
import { createSchedule } from './schedules.ts';
import { startTurn, updateTurn } from './turns.ts';
import { createAnnouncement, postMessage } from './messaging.ts';
import { createOwner } from './owners.ts';
import {
	bookSlot,
	createAmenity,
	createPass,
	issueKey,
	issuePermit,
	logPackage
} from './residents.ts';
import {
	addLeadNote,
	createLead,
	saveLeasingSettings,
	scheduleTour,
	updateLead,
	updatePropertyMarketing
} from './crm.ts';
import { localDate, zonedToUtc } from '#lib/tours.ts';

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

	const t0 = todayISO();
	const waterHeater = await createAsset(ctx, {
		propertyId: maple.id,
		unitId: units[2]!.id,
		vendorId: plumber!.id,
		name: 'Water heater — 103',
		kind: 'water_heater',
		make: 'Rheem',
		model: 'PROE40',
		serialNumber: 'RH103-2205',
		installedOn: addDays(t0, -1150),
		warrantyExpiresOn: addDays(t0, 26),
		notes: 'Basement closet, shared wall. Shut-off valve sticks.'
	});
	const dishwasher = await createAsset(ctx, {
		propertyId: harbor.id,
		unitId: units[8]!.id,
		vendorId: plumber!.id,
		name: 'Dishwasher — A',
		kind: 'appliance',
		make: 'Bosch',
		model: 'SHXM4AY55N',
		serialNumber: null,
		installedOn: addDays(t0, -540),
		warrantyExpiresOn: addDays(t0, -180),
		notes: null
	});
	await createAsset(ctx, {
		propertyId: harbor.id,
		unitId: null,
		vendorId: null,
		name: 'Rooftop HVAC',
		kind: 'hvac',
		make: 'Carrier',
		model: '48TC',
		serialNumber: null,
		installedOn: addDays(t0, -2200),
		warrantyExpiresOn: null,
		notes: 'Services the common hallways.'
	});
	const boiler = await createAsset(ctx, {
		propertyId: maple.id,
		unitId: null,
		vendorId: plumber!.id,
		name: 'Basement boiler',
		kind: 'boiler',
		make: 'Weil-McLain',
		model: 'EGi-45',
		serialNumber: null,
		installedOn: addDays(t0, -3300),
		warrantyExpiresOn: null,
		notes: null
	});

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
		if (title === 'Water heater not working')
			await updateTicket(ctx, { id: t.id, assetId: waterHeater.id });
		if (title === 'Dishwasher leaking')
			await updateTicket(ctx, { id: t.id, assetId: dishwasher.id });
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
	await createSchedule(ctx, {
		propertyId: harbor.id,
		unitId: null,
		assetId: null,
		title: 'Replace hallway HVAC filters',
		description: 'Swap all four hallway unit filters; check return grilles for dust build-up.',
		priority: 'normal',
		vendorId: null,
		assigneeId: null,
		every: 3,
		interval: 'months',
		nextRunOn: addDays(t0, 10),
		leadDays: 14
	});
	await createSchedule(ctx, {
		propertyId: maple.id,
		unitId: null,
		assetId: boiler.id,
		title: 'Annual boiler service',
		description: 'Combustion check, pressure relief valve test, flush low-water cut-off.',
		priority: 'high',
		vendorId: plumber!.id,
		assigneeId: null,
		every: 1,
		interval: 'years',
		nextRunOn: addDays(t0, 45),
		leadDays: 10
	});
	await createSchedule(ctx, {
		propertyId: cedar.id,
		unitId: null,
		assetId: null,
		title: 'Gutter and downspout check',
		description: null,
		priority: 'low',
		vendorId: grounds!.id,
		assigneeId: null,
		every: 6,
		interval: 'months',
		nextRunOn: addDays(t0, 3),
		leadDays: 0
	});
	await createSchedule(ctx, {
		propertyId: maple.id,
		unitId: null,
		assetId: null,
		title: 'Smoke and CO detector batteries',
		description: 'Replace batteries in every unit; log any detector that fails the test button.',
		priority: 'normal',
		vendorId: electric!.id,
		assigneeId: null,
		every: 6,
		interval: 'months',
		nextRunOn: addDays(t0, 90),
		leadDays: 14
	});
	const detectors = await createSchedule(ctx, {
		propertyId: harbor.id,
		unitId: null,
		assetId: null,
		title: 'Elevator maintenance',
		description: null,
		priority: 'normal',
		vendorId: null,
		assigneeId: null,
		every: 1,
		interval: 'months',
		nextRunOn: addDays(t0, 20),
		leadDays: 7
	});
	await db.update(pmSchedule).set({ enabled: false }).where(eq(pmSchedule.id, detectors.id));

	// A move-out in progress on Harbor D — its listing going live will mark it listed.
	const turn = await startTurn(ctx, {
		unitId: units[11]!.id,
		moveOutOn: addDays(t0, -4),
		targetReadyOn: addDays(t0, 6),
		notes: 'Full paint touch-up, steam clean carpets, rekey.'
	});
	await updateTurn(ctx, { id: turn.id, stage: 'make_ready' });
	await startTurn(ctx, {
		unitId: units[12]!.id,
		moveOutOn: addDays(t0, -1),
		targetReadyOn: addDays(t0, 14),
		notes: null
	});

	await loadDemoInspections(ctx, leases[0]!, leases[1]!, start);
	await loadDemoListings(ctx, units.slice(people.length));
	await loadDemoMessages(ctx, tenants, maple.id);
	await loadDemoLeads(ctx, maple.id, harbor.id, cedar.id);
	await createOwner(ctx, {
		name: 'Rivera Family Trust',
		email: 'trust@rivera.example',
		notes: 'Prefers a call before any repair over $1,000.',
		propertyIds: [maple.id, cedar.id]
	});
	await createOwner(ctx, {
		name: 'Harbor Lofts LLC',
		email: 'ops@harborlofts.example',
		propertyIds: [harbor.id]
	});

	// Resident life: bookable amenities and a front-desk package shelf.
	const clubhouse = await createAmenity(ctx, {
		propertyId: maple.id,
		name: 'Clubhouse lounge',
		description: 'Reservable lounge with a kitchenette and patio access.',
		openHour: 8,
		closeHour: 22,
		slotMinutes: 120,
		maxDaysAhead: 14
	});
	await createAmenity(ctx, {
		propertyId: harbor.id,
		name: 'Rooftop deck',
		description: null,
		openHour: 9,
		closeHour: 21,
		slotMinutes: 60,
		maxDaysAhead: 7
	});
	await bookSlot(ctx, {
		amenityId: clubhouse.id,
		tenantId: tenants[0]!.id,
		startsAt: new Date(`${addDays(t0, 1)}T18:00:00`).toISOString(),
		notes: 'Birthday dinner prep'
	});
	await bookSlot(ctx, {
		amenityId: clubhouse.id,
		tenantId: tenants[1]!.id,
		startsAt: new Date(`${addDays(t0, 2)}T10:00:00`).toISOString(),
		notes: null
	});
	await logPackage(ctx, {
		propertyId: maple.id,
		unitId: leases[0]!.unitId,
		tenantId: tenants[0]!.id,
		carrier: 'UPS',
		tracking: '1Z999AA10123456784',
		description: 'Medium box'
	});
	await logPackage(ctx, {
		propertyId: harbor.id,
		unitId: null,
		tenantId: tenants[1]!.id,
		carrier: 'USPS',
		tracking: null,
		description: 'Padded envelope'
	});
	await issuePermit(ctx, {
		propertyId: maple.id,
		unitId: leases[0]!.unitId,
		tenantId: tenants[0]!.id,
		permitNumber: 'MC-0142',
		vehicle: 'Blue Honda Civic · MZX 7841',
		expiresOn: addYears(t0, 1),
		notes: null
	});
	await issueKey(ctx, {
		propertyId: maple.id,
		unitId: leases[0]!.unitId,
		tenantId: tenants[0]!.id,
		kind: 'fob',
		label: 'Building entry fob #4471',
		notes: null
	});
	await issueKey(ctx, {
		propertyId: harbor.id,
		unitId: leases[8]!.unitId,
		tenantId: tenants[8]!.id,
		kind: 'key',
		label: 'Unit A front door',
		notes: null
	});
	await createPass(ctx, {
		propertyId: maple.id,
		unitId: leases[0]!.unitId,
		tenantId: tenants[0]!.id,
		guestName: 'Sam Rivera',
		startsOn: t0,
		endsOn: addDays(t0, 2),
		notes: 'Overnight guest, parks in visitor row'
	});
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

async function loadDemoLeads(ctx: OrgContext, maple: string, harbor: string, cedar: string) {
	const timezone = 'America/Chicago';
	const today = localDate(new Date(), timezone);
	await saveLeasingSettings(ctx.orgId, {
		selfBooking: true,
		timezone,
		tourDays: [1, 2, 3, 4, 5, 6],
		tourStart: 10 * 60,
		tourEnd: 18 * 60,
		slotMinutes: 30,
		noticeHours: 2
	});
	// Harbor has the published listings; Maple is full, so its page collects waitlist sign-ups.
	await updatePropertyMarketing(ctx, {
		id: harbor,
		marketingDescription:
			'Bright lofts by the water with exposed brick, big windows and a rooftop deck looking over the marina. The 7 bus stops at the corner and downtown is a ten-minute ride.',
		amenities: ['Rooftop deck', 'Fitness room', 'Covered parking', 'Package room']
	});
	await updatePropertyMarketing(ctx, {
		id: maple,
		publicPage: true,
		marketingDescription:
			'A quiet, tree-lined courtyard building five minutes from downtown, with secure bike storage, a shared garden and on-site laundry.',
		amenities: ['Courtyard garden', 'Bike storage', 'On-site laundry']
	});
	const at = (days: number, minutes: number) =>
		zonedToUtc(addDays(today, days), minutes, timezone).toISOString();
	type Seed = {
		firstName: string;
		lastName: string;
		source: 'website' | 'phone' | 'referral' | 'walk_in' | 'listing_site';
		propertyId: string;
		bedrooms: number | null;
		budget: number;
		followUp: number | null;
		stage?: 'contacted' | 'touring' | 'lost';
		waitlist?: boolean;
		tour?: [days: number, minutes: number, kind: 'in_person' | 'virtual'];
		notes?: [kind: 'note' | 'call' | 'email' | 'text' | 'inquiry', body: string][];
	};
	const seeds: Seed[] = [
		{
			firstName: 'Ava',
			lastName: 'Brooks',
			source: 'website',
			propertyId: maple,
			bedrooms: 1,
			budget: 160000,
			followUp: 0,
			notes: [
				['inquiry', 'Is the one-bedroom still available for a July move? I have a small dog.']
			]
		},
		{
			firstName: 'Marcus',
			lastName: 'Lee',
			source: 'phone',
			propertyId: maple,
			bedrooms: 2,
			budget: 210000,
			followUp: -2,
			stage: 'contacted',
			notes: [['call', 'Relocating for work in about six weeks. Wants two bedrooms near downtown.']]
		},
		{
			firstName: 'Sofia',
			lastName: 'Ramirez',
			source: 'listing_site',
			propertyId: cedar,
			bedrooms: 2,
			budget: 190000,
			followUp: 1,
			tour: [0, 16 * 60, 'in_person'],
			notes: [
				['email', 'Sent available units and parking details. Booked a tour for this afternoon.']
			]
		},
		{
			firstName: 'Ethan',
			lastName: 'Clarke',
			source: 'referral',
			propertyId: maple,
			bedrooms: 1,
			budget: 150000,
			followUp: 3,
			tour: [2, 11 * 60, 'virtual'],
			notes: [
				['note', 'Referred by Maya Chen in 2B. Currently overseas, wants a video walkthrough.']
			]
		},
		{
			firstName: 'Grace',
			lastName: 'Kim',
			source: 'website',
			propertyId: harbor,
			bedrooms: 2,
			budget: 260000,
			followUp: 10,
			waitlist: true,
			notes: [['inquiry', 'Please let me know when a two-bedroom loft opens up.']]
		},
		{
			firstName: 'Noah',
			lastName: 'Patel',
			source: 'walk_in',
			propertyId: harbor,
			bedrooms: 1,
			budget: 200000,
			followUp: null,
			waitlist: true
		},
		{
			firstName: 'Liam',
			lastName: 'Foster',
			source: 'phone',
			propertyId: cedar,
			bedrooms: 3,
			budget: 180000,
			followUp: null,
			stage: 'lost',
			notes: [['call', 'Needed three bedrooms under budget. Signed elsewhere.']]
		}
	];
	for (const seed of seeds) {
		const { id } = await createLead(ctx, {
			firstName: seed.firstName,
			lastName: seed.lastName,
			email: `${seed.firstName.toLowerCase()}.${seed.lastName.toLowerCase()}@example.com`,
			phone: null,
			source: seed.source,
			sourceDetail: seed.source === 'listing_site' ? 'Apartment search site' : null,
			propertyId: seed.propertyId,
			listingId: null,
			moveInDate: addDays(today, 30),
			bedrooms: seed.bedrooms,
			budgetMax: seed.budget,
			message: null,
			assignedTo: ctx.userId,
			nextFollowUpOn: seed.followUp == null ? null : addDays(today, seed.followUp),
			waitlist: seed.waitlist ?? false
		});
		for (const [kind, body] of seed.notes ?? [])
			await addLeadNote(ctx, { leadId: id, kind: kind as 'note', body });
		if (seed.tour) {
			const [days, minutes, kind] = seed.tour;
			await scheduleTour(ctx, {
				leadId: id,
				propertyId: seed.propertyId,
				listingId: null,
				startsAt: at(days, minutes),
				durationMinutes: 30,
				kind,
				agentId: ctx.userId,
				notes: null
			});
		}
		if (seed.stage)
			await updateLead(ctx, {
				id,
				stage: seed.stage,
				lostReason: seed.stage === 'lost' ? 'Rented elsewhere' : null
			});
	}
}
