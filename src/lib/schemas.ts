import * as v from 'valibot';
import { REPORT_KEYS } from './reports.ts';
import { IMPORT_KINDS } from './import.ts';
import { LEAD_NOTE_KINDS, LEAD_SOURCES, LEAD_STAGES, TOUR_KINDS, TOUR_STATUSES } from './leads.ts';
import { PM_INTERVALS } from './pm.ts';

const optionalText = v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(5000))));
const requiredText = (label: string) =>
	v.pipe(v.string(), v.trim(), v.nonEmpty(`${label} is required`), v.maxLength(200));
const isoDate = v.pipe(v.string(), v.isoDate('Use YYYY-MM-DD'));
const optionalInt = v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))));
/** Money is sent in cents. */
const cents = v.pipe(v.number(), v.integer(), v.minValue(0));
const shortText = (max = 200) =>
	v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max))));
export const idSchema = v.pipe(v.string(), v.nonEmpty());

export const propertyTypes = [
	'single_family',
	'multi_family',
	'condo',
	'commercial',
	'mixed_use',
	'other'
] as const;
export const unitStatuses = ['vacant', 'occupied', 'notice', 'offline'] as const;
export const leaseStatuses = ['draft', 'active', 'ended', 'terminated'] as const;
export const rentFrequencies = ['monthly', 'weekly', 'quarterly', 'yearly'] as const;
export const chargeKinds = ['rent', 'deposit', 'fee', 'utility', 'other'] as const;
export const paymentMethods = ['ach', 'card', 'check', 'cash', 'transfer', 'other'] as const;
export const ticketStatuses = ['open', 'in_progress', 'on_hold', 'done', 'cancelled'] as const;
export const ticketPriorities = ['low', 'normal', 'high', 'urgent'] as const;
export const assetKinds = [
	'appliance',
	'boiler',
	'electrical',
	'elevator',
	'hvac',
	'laundry',
	'plumbing',
	'pool',
	'roof',
	'safety',
	'water_heater',
	'other'
] as const;
export const turnStages = ['move_out', 'make_ready', 'listed', 'done'] as const;

export const propertyInput = v.object({
	name: requiredText('Name'),
	type: v.optional(v.picklist(propertyTypes), 'multi_family'),
	addressLine1: v.optional(v.pipe(v.string(), v.trim()), ''),
	addressLine2: optionalText,
	city: v.optional(v.pipe(v.string(), v.trim()), ''),
	region: v.optional(v.pipe(v.string(), v.trim()), ''),
	postalCode: v.optional(v.pipe(v.string(), v.trim()), ''),
	country: v.optional(v.pipe(v.string(), v.trim(), v.length(2)), 'US'),
	notes: optionalText
});
export const propertyCreate = v.object({
	...propertyInput.entries,
	units: v.optional(v.array(requiredText('Unit name')), [])
});
export const propertyUpdate = v.object({ id: idSchema, ...v.partial(propertyInput).entries });

export const unitInput = v.object({
	propertyId: idSchema,
	name: requiredText('Unit name'),
	bedrooms: optionalInt,
	bathrooms: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0)))),
	areaSqft: optionalInt,
	marketRent: v.optional(v.nullable(cents)),
	status: v.optional(v.picklist(unitStatuses), 'vacant'),
	notes: optionalText
});
export const unitUpdate = v.object({
	id: idSchema,
	...v.partial(v.omit(unitInput, ['propertyId'])).entries
});

export const tenantInput = v.object({
	kind: v.optional(v.picklist(['person', 'company']), 'person'),
	firstName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
	lastName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
	companyName: optionalText,
	email: v.optional(
		v.nullable(v.union([v.literal(''), v.pipe(v.string(), v.trim(), v.email('Invalid email'))]))
	),
	phone: optionalText,
	notes: optionalText
});
export const tenantUpdate = v.object({ id: idSchema, ...v.partial(tenantInput).entries });

export const leaseInput = v.object({
	unitId: idSchema,
	tenantIds: v.pipe(v.array(idSchema), v.minLength(1, 'Add at least one tenant')),
	status: v.optional(v.picklist(leaseStatuses), 'active'),
	startDate: isoDate,
	endDate: v.optional(v.nullable(isoDate)),
	rentAmount: cents,
	depositAmount: v.optional(cents, 0),
	rentDueDay: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(28)), 1),
	frequency: v.optional(v.picklist(rentFrequencies), 'monthly'),
	currency: v.optional(v.pipe(v.string(), v.length(3)), 'USD'),
	lateFeeAmount: v.optional(cents, 0),
	lateFeeGraceDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(31)), 5),
	notes: optionalText
});
export const leaseUpdate = v.object({
	id: idSchema,
	...v.partial(v.omit(leaseInput, ['unitId', 'tenantIds'])).entries
});

export const leaseRenewal = v.object({
	id: idSchema,
	startDate: isoDate,
	endDate: v.optional(v.nullable(isoDate)),
	rentAmount: v.pipe(cents, v.minValue(1, 'Rent must be positive'))
});

export const notificationSettingsInput = v.object({
	rentReminders: v.boolean(),
	reminderDaysBefore: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(14)),
	overdueNotices: v.boolean(),
	maintenanceUpdates: v.boolean(),
	leaseExpiryAlerts: v.boolean(),
	vendorInsuranceAlerts: v.boolean(),
	newApplications: v.boolean(),
	newLeads: v.boolean()
});

export const chargeInput = v.object({
	leaseId: idSchema,
	kind: v.optional(v.picklist(chargeKinds), 'fee'),
	description: optionalText,
	dueDate: isoDate,
	amount: v.pipe(cents, v.minValue(1, 'Amount must be positive'))
});

export const paymentInput = v.object({
	leaseId: idSchema,
	chargeId: v.optional(v.nullable(idSchema)),
	amount: v.pipe(cents, v.minValue(1, 'Amount must be positive')),
	receivedOn: isoDate,
	method: v.optional(v.picklist(paymentMethods), 'ach'),
	reference: optionalText,
	notes: optionalText
});

export const ticketInput = v.object({
	propertyId: idSchema,
	unitId: v.optional(v.nullable(idSchema)),
	tenantId: v.optional(v.nullable(idSchema)),
	title: requiredText('Title'),
	description: optionalText,
	priority: v.optional(v.picklist(ticketPriorities), 'normal'),
	status: v.optional(v.picklist(ticketStatuses), 'open'),
	assigneeId: v.optional(v.nullable(idSchema)),
	vendorId: v.optional(v.nullable(idSchema)),
	assetId: v.optional(v.nullable(idSchema)),
	costAmount: v.optional(v.nullable(cents)),
	dueDate: v.optional(v.nullable(isoDate))
});
export const ticketUpdate = v.object({ id: idSchema, ...v.partial(ticketInput).entries });

export const assetInput = v.object({
	propertyId: idSchema,
	unitId: v.optional(v.nullable(idSchema)),
	vendorId: v.optional(v.nullable(idSchema)),
	name: requiredText('Name'),
	kind: v.optional(v.picklist(assetKinds), 'other'),
	make: shortText(100),
	model: shortText(100),
	serialNumber: shortText(100),
	installedOn: v.optional(v.nullable(isoDate)),
	warrantyExpiresOn: v.optional(v.nullable(isoDate)),
	notes: optionalText
});
export const assetUpdate = v.object({
	id: idSchema,
	...v.partial(v.omit(assetInput, ['propertyId'])).entries,
	archived: v.optional(v.boolean())
});

export const scheduleInput = v.object({
	propertyId: idSchema,
	unitId: v.optional(v.nullable(idSchema)),
	assetId: v.optional(v.nullable(idSchema)),
	title: requiredText('Title'),
	description: optionalText,
	priority: v.optional(v.picklist(ticketPriorities), 'normal'),
	vendorId: v.optional(v.nullable(idSchema)),
	assigneeId: v.optional(v.nullable(idSchema)),
	every: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(52)), 1),
	interval: v.optional(v.picklist(PM_INTERVALS), 'months'),
	nextRunOn: isoDate,
	leadDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(90)), 7)
});
export const scheduleUpdate = v.object({
	id: idSchema,
	...v.partial(v.omit(scheduleInput, ['propertyId'])).entries,
	enabled: v.optional(v.boolean())
});

export const turnInput = v.object({
	unitId: idSchema,
	moveOutOn: v.optional(v.nullable(isoDate)),
	targetReadyOn: v.optional(v.nullable(isoDate)),
	notes: optionalText
});
export const turnUpdate = v.object({
	id: idSchema,
	stage: v.optional(v.picklist(turnStages)),
	moveOutOn: v.optional(v.nullable(isoDate)),
	targetReadyOn: v.optional(v.nullable(isoDate)),
	notes: optionalText
});

const noteBody = v.pipe(v.string(), v.trim(), v.nonEmpty('Write a note'), v.maxLength(5000));
export const ticketNoteInput = v.object({
	ticketId: idSchema,
	body: noteBody,
	internal: v.optional(v.boolean(), false)
});

export const vendorTrades = [
	'General',
	'Plumbing',
	'Electrical',
	'HVAC',
	'Appliances',
	'Roofing',
	'Painting',
	'Cleaning',
	'Landscaping',
	'Pest control',
	'Locksmith',
	'Flooring'
] as const;

const shortOptional = (max = 200) =>
	v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max))));
export const vendorInput = v.object({
	name: requiredText('Name'),
	contactName: shortOptional(),
	email: v.optional(
		v.nullable(
			v.union([v.literal(''), v.pipe(v.string(), v.trim(), v.email('Enter a valid email'))])
		)
	),
	phone: shortOptional(40),
	trades: v.optional(
		v.pipe(v.array(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(40))), v.maxLength(20)),
		[]
	),
	notes: optionalText,
	insuranceExpiresOn: v.optional(v.nullable(isoDate))
});
export const vendorUpdate = v.object({
	id: idSchema,
	...v.partial(vendorInput).entries,
	archived: v.optional(v.boolean())
});

export const ownerInput = v.object({
	name: requiredText('Name'),
	email: v.optional(
		v.nullable(
			v.union([v.literal(''), v.pipe(v.string(), v.trim(), v.email('Enter a valid email'))])
		)
	),
	phone: shortOptional(40),
	notes: optionalText,
	propertyIds: v.optional(v.pipe(v.array(idSchema), v.maxLength(500)))
});
export const ownerUpdate = v.object({
	id: idSchema,
	...v.partial(ownerInput).entries,
	archived: v.optional(v.boolean())
});

/** What a vendor may do from their work-order link. */
export const workOrderUpdate = v.object({
	token: v.pipe(v.string(), v.maxLength(500)),
	status: v.optional(v.picklist(['in_progress', 'on_hold', 'done'] as const)),
	costAmount: v.optional(v.nullable(cents)),
	note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(5000)))
});

export const webhookInput = v.object({
	url: v.pipe(v.string(), v.url('Enter a valid URL')),
	events: v.optional(v.array(v.string()), ['*'])
});

export const monthSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/));

export type PropertyCreate = v.InferInput<typeof propertyCreate>;
export type UnitInput = v.InferInput<typeof unitInput>;
export type TenantInput = v.InferInput<typeof tenantInput>;
export type LeaseInput = v.InferInput<typeof leaseInput>;
export type PaymentInput = v.InferInput<typeof paymentInput>;
export type TicketInput = v.InferInput<typeof ticketInput>;

const agreementBody = v.pipe(
	v.string(),
	v.trim(),
	v.nonEmpty('The document is empty'),
	v.maxLength(100_000)
);
export const templateInput = v.object({
	id: v.optional(idSchema),
	name: requiredText('Name'),
	body: agreementBody
});
export const agreementCreate = v.object({ leaseId: idSchema, templateId: v.optional(idSchema) });
export const agreementUpdate = v.object({
	id: idSchema,
	title: requiredText('Title'),
	body: agreementBody
});
export const agreementSign = v.object({
	id: idSchema,
	signedName: v.pipe(v.string(), v.trim(), v.nonEmpty('Type your full name'), v.maxLength(200)),
	contentHash: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
	consent: v.literal(true, 'Agree to sign electronically')
});

export const listingStatuses = ['draft', 'published', 'closed'] as const;
export const applicationStatuses = [
	'new',
	'reviewing',
	'approved',
	'declined',
	'withdrawn'
] as const;

export const listingCreate = v.object({ unitId: idSchema });
export const listingUpdate = v.object({
	id: idSchema,
	title: v.optional(requiredText('Title')),
	description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(10_000))),
	rentAmount: v.optional(cents),
	depositAmount: v.optional(cents),
	availableOn: v.optional(v.nullable(isoDate)),
	leaseTermMonths: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)))
	),
	petPolicy: optionalText,
	amenities: v.optional(
		v.pipe(
			v.array(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(60))),
			v.maxLength(30, 'Up to 30 amenities')
		)
	)
});
export const listingStatusInput = v.object({
	id: idSchema,
	status: v.picklist(listingStatuses)
});

/** Public application form. Asks nothing about protected characteristics. */
export const applicationInput = v.object({
	listingId: idSchema,
	firstName: v.pipe(v.string(), v.trim(), v.nonEmpty('First name is required'), v.maxLength(100)),
	lastName: v.pipe(v.string(), v.trim(), v.nonEmpty('Last name is required'), v.maxLength(100)),
	email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email'), v.maxLength(200)),
	phone: shortText(40),
	moveInDate: v.optional(v.nullable(isoDate)),
	occupants: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)), 1),
	pets: shortText(500),
	employer: shortText(),
	monthlyIncome: v.optional(v.nullable(cents)),
	currentAddress: shortText(300),
	message: shortText(2000),
	consent: v.literal(true, 'Confirm the information is accurate'),
	/** Honeypot: real people leave this empty. */
	website: v.optional(v.string(), '')
});

export const applicationUpdate = v.object({
	id: idSchema,
	status: v.optional(v.picklist(['new', 'reviewing', 'declined', 'withdrawn'] as const)),
	notes: optionalText
});

export const applicationApprove = v.object({
	id: idSchema,
	startDate: isoDate,
	endDate: v.optional(v.nullable(isoDate)),
	rentAmount: v.pipe(cents, v.minValue(1, 'Rent must be positive')),
	depositAmount: v.optional(cents, 0)
});

export const inspectionKinds = ['move_in', 'move_out', 'routine'] as const;
export const itemConditions = ['good', 'fair', 'poor', 'damaged', 'na'] as const;

export const inspectionCreate = v.object({
	unitId: idSchema,
	kind: v.picklist(inspectionKinds),
	leaseId: v.optional(v.nullable(idSchema)),
	scheduledFor: v.optional(v.nullable(isoDate))
});
export const inspectionUpdate = v.object({
	id: idSchema,
	scheduledFor: v.optional(v.nullable(isoDate)),
	summary: optionalText
});
export const inspectionItemAdd = v.object({
	inspectionId: idSchema,
	area: requiredText('Area'),
	label: requiredText('Item')
});
export const inspectionItemUpdate = v.object({
	id: idSchema,
	label: v.optional(requiredText('Item')),
	condition: v.optional(v.nullable(v.picklist(itemConditions))),
	notes: optionalText
});
export const inspectionAcknowledge = v.object({
	id: idSchema,
	comment: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(2000))))
});

const messageBody = v.pipe(v.string(), v.trim(), v.nonEmpty('Write a message'), v.maxLength(5000));

export const messageSend = v.object({ tenantId: idSchema, body: messageBody });

export const announcementCreate = v.object({
	propertyId: v.optional(v.nullable(idSchema)),
	subject: requiredText('Subject'),
	body: v.pipe(v.string(), v.trim(), v.nonEmpty('Write the announcement'), v.maxLength(10000)),
	email: v.optional(v.boolean(), true)
});

export const reportParams = v.object({
	key: v.picklist(REPORT_KEYS),
	propertyId: v.optional(v.nullable(idSchema)),
	days: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(730))),
	months: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(36))),
	from: v.optional(isoDate),
	to: v.optional(isoDate)
});

export const importInput = v.object({
	kind: v.picklist(IMPORT_KINDS),
	csv: v.pipe(v.string(), v.maxLength(2_000_000, 'File is over 2 MB')),
	mapping: v.record(v.string(), v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	dryRun: v.boolean()
});

// ── Leasing CRM ─────────────────────────────────────────────────────────────

const name = (label: string) =>
	v.pipe(v.string(), v.trim(), v.nonEmpty(`${label} is required`), v.maxLength(100));
const optionalEmail = v.optional(
	v.nullable(v.pipe(v.string(), v.trim(), v.email('Enter a valid email'), v.maxLength(200)))
);
const bedrooms = v.optional(
	v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20)))
);

export const leadInput = v.object({
	firstName: name('First name'),
	lastName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ''),
	email: optionalEmail,
	phone: shortText(40),
	source: v.optional(v.picklist(LEAD_SOURCES), 'other'),
	sourceDetail: shortText(200),
	propertyId: v.optional(v.nullable(idSchema)),
	listingId: v.optional(v.nullable(idSchema)),
	moveInDate: v.optional(v.nullable(isoDate)),
	bedrooms,
	budgetMax: v.optional(v.nullable(cents)),
	message: shortText(2000),
	assignedTo: v.optional(v.nullable(idSchema)),
	nextFollowUpOn: v.optional(v.nullable(isoDate)),
	waitlist: v.optional(v.boolean(), false)
});

/** API-created leads default to the `api` source. */
export const leadApiInput = v.object({
	...leadInput.entries,
	source: v.optional(v.picklist(LEAD_SOURCES), 'api')
});

export const leadUpdate = v.object({
	id: idSchema,
	...v.partial(v.omit(leadInput, ['source'])).entries,
	source: v.optional(v.picklist(LEAD_SOURCES)),
	stage: v.optional(v.picklist(LEAD_STAGES)),
	lostReason: shortText(500)
});

export const leadNoteInput = v.object({
	leadId: idSchema,
	kind: v.optional(v.picklist(LEAD_NOTE_KINDS), 'note'),
	body: v.pipe(v.string(), v.trim(), v.nonEmpty('Write something first'), v.maxLength(5000)),
	nextFollowUpOn: v.optional(v.nullable(isoDate))
});

const instant = v.pipe(v.string(), v.isoTimestamp('Use an ISO 8601 timestamp'));

export const tourInput = v.object({
	leadId: idSchema,
	propertyId: idSchema,
	listingId: v.optional(v.nullable(idSchema)),
	startsAt: instant,
	durationMinutes: v.optional(v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(240)), 30),
	kind: v.optional(v.picklist(TOUR_KINDS), 'in_person'),
	agentId: v.optional(v.nullable(idSchema)),
	notes: shortText(2000)
});

export const tourUpdate = v.object({
	id: idSchema,
	status: v.optional(v.picklist(TOUR_STATUSES)),
	startsAt: v.optional(instant),
	durationMinutes: v.optional(v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(240))),
	kind: v.optional(v.picklist(TOUR_KINDS)),
	agentId: v.optional(v.nullable(idSchema)),
	notes: shortText(2000)
});

export const leasingSettingsInput = v.object({
	selfBooking: v.boolean(),
	timezone: v.pipe(v.string(), v.nonEmpty(), v.maxLength(64)),
	tourDays: v.pipe(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6))),
		v.maxLength(7)
	),
	tourStart: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(24 * 60)),
	tourEnd: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(24 * 60)),
	slotMinutes: v.picklist([15, 30, 45, 60]),
	noticeHours: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(168))
});

export const propertyMarketingInput = v.object({
	id: idSchema,
	publicPage: v.optional(v.boolean()),
	marketingDescription: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(5000))),
	amenities: v.optional(
		v.pipe(v.array(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(60))), v.maxLength(40))
	)
});

const publicContact = {
	orgSlug: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
	propertyId: v.optional(v.nullable(idSchema)),
	listingId: v.optional(v.nullable(idSchema)),
	firstName: name('First name'),
	lastName: name('Last name'),
	email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email'), v.maxLength(200)),
	phone: shortText(40),
	consent: v.literal(true, 'Agree to be contacted'),
	/** Honeypot: real people leave this empty. */
	website: v.optional(v.string(), '')
};

/** Public "contact us" / "join the waitlist" form. */
export const inquiryInput = v.object({
	...publicContact,
	moveInDate: v.optional(v.nullable(isoDate)),
	bedrooms,
	message: shortText(2000),
	waitlist: v.optional(v.boolean(), false)
});

/** Public self-booked tour. */
export const tourBookingInput = v.object({
	...publicContact,
	propertyId: idSchema,
	startsAt: instant,
	message: shortText(1000)
});

export const tourSlotsInput = v.object({
	orgSlug: v.pipe(v.string(), v.nonEmpty(), v.maxLength(100)),
	propertyId: idSchema
});

/** Entity keys custom fields can attach to (each has a record page/section). */
export const FIELD_ENTITIES = ['tenant', 'property', 'lease', 'vendor', 'owner', 'ticket'] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];
export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'checkbox'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Actions a workflow rule can take when its event fires. */
export const WORKFLOW_ACTIONS = ['notify', 'create_ticket'] as const;
export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];

/** Suggested event types for the rule form; any `entity.action` string is accepted. */
export const WORKFLOW_EVENT_SUGGESTIONS = [
	'*',
	'lead.created',
	'lead.stage_changed',
	'tour.tour_scheduled',
	'application.submitted',
	'lease.created',
	'lease.updated',
	'lease.renewed',
	'maintenance.created',
	'maintenance.updated',
	'inspection.completed',
	'payment.recorded',
	'document.created',
	'announcement.sent',
	'vendor.created',
	'owner.created',
	'tenant.created',
	'turn.updated'
] as const;

export const workflowInput = v.object({
	name: v.pipe(v.string(), v.trim(), v.nonEmpty('Name the rule'), v.maxLength(80)),
	eventType: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty('Pick an event'),
		v.regex(/^(\*|[a-z_]+\.[a-z_]+)$/, 'Use entity.action, e.g. maintenance.created')
	),
	action: v.picklist(WORKFLOW_ACTIONS),
	/** notify: optional custom note. create_ticket: title/priority/propertyId. */
	config: v.optional(
		v.object({
			message: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(300)))),
			title: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(120)))),
			priority: v.optional(v.nullable(v.picklist(ticketPriorities))),
			propertyId: v.optional(v.nullable(idSchema))
		}),
		{}
	)
});
export const workflowUpdate = v.object({
	id: idSchema,
	...v.partial(workflowInput).entries,
	enabled: v.optional(v.boolean())
});

/** A bookable amenity and its hours/slot policy. */
export const amenityInput = v.object({
	propertyId: idSchema,
	name: requiredText('Name'),
	description: optionalText,
	openHour: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23)), 8),
	closeHour: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(24)), 21),
	slotMinutes: v.optional(v.pipe(v.number(), v.integer(), v.minValue(15), v.maxValue(720)), 120),
	maxDaysAhead: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)), 14)
});

/** Book a slot on an amenity; `startsAt` is an ISO timestamp. */
export const bookingInput = v.object({
	amenityId: idSchema,
	tenantId: v.optional(v.nullable(idSchema)),
	startsAt: v.pipe(v.string(), v.isoTimestamp()),
	notes: v.optional(v.nullable(shortText(300)))
});

export const packageInput = v.object({
	propertyId: idSchema,
	unitId: v.optional(v.nullable(idSchema)),
	tenantId: v.optional(v.nullable(idSchema)),
	carrier: v.optional(v.nullable(shortText(40))),
	tracking: v.optional(v.nullable(shortText(80))),
	description: v.optional(v.nullable(shortText(300)))
});

export const KEY_KINDS = ['key', 'fob', 'remote', 'card', 'other'] as const;
export type KeyKind = (typeof KEY_KINDS)[number];
export const KEY_KIND_LABELS: Record<KeyKind, string> = {
	key: 'Key',
	fob: 'Fob',
	remote: 'Gate remote',
	card: 'Access card',
	other: 'Other'
};

export const permitInput = v.object({
	propertyId: idSchema,
	unitId: v.optional(v.nullable(idSchema)),
	tenantId: v.optional(v.nullable(idSchema)),
	permitNumber: requiredText('Permit #'),
	vehicle: v.optional(v.nullable(shortText(120))),
	expiresOn: v.optional(v.nullable(v.pipe(v.string(), v.isoDate()))),
	notes: v.optional(v.nullable(shortText(300)))
});

export const keyInput = v.object({
	propertyId: idSchema,
	unitId: v.optional(v.nullable(idSchema)),
	tenantId: v.optional(v.nullable(idSchema)),
	kind: v.picklist(KEY_KINDS),
	label: requiredText('Label'),
	notes: v.optional(v.nullable(shortText(300)))
});

export const passInput = v.object({
	propertyId: idSchema,
	unitId: v.optional(v.nullable(idSchema)),
	tenantId: v.optional(v.nullable(idSchema)),
	guestName: requiredText('Guest name'),
	startsOn: v.pipe(v.string(), v.isoDate()),
	endsOn: v.pipe(v.string(), v.isoDate()),
	notes: v.optional(v.nullable(shortText(300)))
});

export const eventInput = v.object({
	propertyId: idSchema,
	title: requiredText('Title'),
	description: v.optional(v.nullable(shortText(2000))),
	location: v.optional(v.nullable(shortText(120))),
	startsAt: v.pipe(v.string(), v.isoTimestamp()),
	endsAt: v.optional(v.nullable(v.pipe(v.string(), v.isoTimestamp()))),
	capacity: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100000)))
	)
});

export const surveyInput = v.object({
	propertyId: v.optional(v.nullable(idSchema)),
	title: requiredText('Title'),
	question: requiredText('Question')
});

export const surveyResponseInput = v.object({
	surveyId: idSchema,
	rating: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)))),
	comment: v.optional(v.nullable(shortText(2000)))
});

export const CLAUSE_KINDS = [
	'option_to_renew',
	'option_to_expand',
	'option_to_purchase',
	'right_of_first_refusal',
	'exclusivity',
	'termination_option',
	'escalation',
	'percentage_rent',
	'subletting',
	'insurance',
	'other'
] as const;

export const CLAUSE_KIND_LABELS: Record<(typeof CLAUSE_KINDS)[number], string> = {
	option_to_renew: 'Renewal option',
	option_to_expand: 'Expansion option',
	option_to_purchase: 'Purchase option',
	right_of_first_refusal: 'Right of first refusal',
	exclusivity: 'Exclusivity',
	termination_option: 'Termination option',
	escalation: 'Escalation',
	percentage_rent: 'Percentage rent',
	subletting: 'Subletting',
	insurance: 'Insurance',
	other: 'Other'
};

export const clauseInput = v.object({
	leaseId: idSchema,
	kind: v.picklist(CLAUSE_KINDS),
	title: requiredText('Title'),
	body: v.optional(v.nullable(shortText(2000)))
});

export const criticalDateInput = v.object({
	leaseId: idSchema,
	clauseId: v.optional(v.nullable(idSchema)),
	label: requiredText('Label'),
	date: v.pipe(v.string(), v.isoDate()),
	remindDays: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(365)))
	)
});

export const criticalDateDoneInput = v.object({
	id: idSchema,
	done: v.boolean()
});
export type ClauseKind = (typeof CLAUSE_KINDS)[number];
