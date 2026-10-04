import * as v from 'valibot';

const optionalText = v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(5000))));
const requiredText = (label: string) =>
	v.pipe(v.string(), v.trim(), v.nonEmpty(`${label} is required`), v.maxLength(200));
const isoDate = v.pipe(v.string(), v.isoDate('Use YYYY-MM-DD'));
const optionalInt = v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))));
/** Money is sent in cents. */
const cents = v.pipe(v.number(), v.integer(), v.minValue(0));
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
	notes: optionalText
});
export const leaseUpdate = v.object({
	id: idSchema,
	...v.partial(v.omit(leaseInput, ['unitId', 'tenantIds'])).entries
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
	vendor: optionalText,
	dueDate: v.optional(v.nullable(isoDate))
});
export const ticketUpdate = v.object({ id: idSchema, ...v.partial(ticketInput).entries });

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
