import { sql } from 'drizzle-orm';
import {
	boolean,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { organization, user } from './auth.schema.ts';

export * from './auth.schema.ts';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const orgId = () =>
	text('organization_id')
		.notNull()
		.references(() => organization.id, { onDelete: 'cascade' });

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
};

export const propertyType = pgEnum('property_type', [
	'single_family',
	'multi_family',
	'condo',
	'commercial',
	'mixed_use',
	'other'
]);

export const property = pgTable(
	'property',
	{
		id: id(),
		organizationId: orgId(),
		name: text('name').notNull(),
		type: propertyType('type').notNull().default('multi_family'),
		addressLine1: text('address_line1').notNull().default(''),
		addressLine2: text('address_line2'),
		city: text('city').notNull().default(''),
		region: text('region').notNull().default(''),
		postalCode: text('postal_code').notNull().default(''),
		country: text('country').notNull().default('US'),
		notes: text('notes'),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [index('property_org_idx').on(t.organizationId, t.name)]
);

export const unitStatus = pgEnum('unit_status', ['vacant', 'occupied', 'notice', 'offline']);

export const unit = pgTable(
	'unit',
	{
		id: id(),
		organizationId: orgId(),
		propertyId: text('property_id')
			.notNull()
			.references(() => property.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		bedrooms: integer('bedrooms'),
		bathrooms: numeric('bathrooms', { precision: 3, scale: 1, mode: 'number' }),
		areaSqft: integer('area_sqft'),
		marketRent: integer('market_rent'),
		status: unitStatus('status').notNull().default('vacant'),
		notes: text('notes'),
		...timestamps
	},
	(t) => [
		index('unit_org_idx').on(t.organizationId),
		uniqueIndex('unit_property_name_idx').on(t.propertyId, t.name)
	]
);

export const contactKind = pgEnum('contact_kind', ['person', 'company']);

export const tenant = pgTable(
	'tenant',
	{
		id: id(),
		organizationId: orgId(),
		kind: contactKind('kind').notNull().default('person'),
		firstName: text('first_name').notNull().default(''),
		lastName: text('last_name').notNull().default(''),
		companyName: text('company_name'),
		email: text('email'),
		phone: text('phone'),
		notes: text('notes'),
		portalUserId: text('portal_user_id').references(() => user.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [
		index('tenant_org_idx').on(t.organizationId, t.lastName),
		index('tenant_email_idx').on(t.organizationId, t.email)
	]
);

export const leaseStatus = pgEnum('lease_status', ['draft', 'active', 'ended', 'terminated']);
export const rentFrequency = pgEnum('rent_frequency', ['monthly', 'weekly', 'quarterly', 'yearly']);

export const lease = pgTable(
	'lease',
	{
		id: id(),
		organizationId: orgId(),
		unitId: text('unit_id')
			.notNull()
			.references(() => unit.id, { onDelete: 'restrict' }),
		status: leaseStatus('status').notNull().default('draft'),
		startDate: date('start_date', { mode: 'string' }).notNull(),
		endDate: date('end_date', { mode: 'string' }),
		rentAmount: integer('rent_amount').notNull(),
		depositAmount: integer('deposit_amount').notNull().default(0),
		rentDueDay: integer('rent_due_day').notNull().default(1),
		frequency: rentFrequency('frequency').notNull().default('monthly'),
		currency: text('currency').notNull().default('USD'),
		lateFeeAmount: integer('late_fee_amount').notNull().default(0),
		lateFeeGraceDays: integer('late_fee_grace_days').notNull().default(5),
		renewedFromId: text('renewed_from_id'),
		notes: text('notes'),
		...timestamps
	},
	(t) => [
		index('lease_org_status_idx').on(t.organizationId, t.status),
		index('lease_unit_idx').on(t.unitId),
		index('lease_renewed_from_idx').on(t.renewedFromId)
	]
);

export const leaseTenant = pgTable(
	'lease_tenant',
	{
		leaseId: text('lease_id')
			.notNull()
			.references(() => lease.id, { onDelete: 'cascade' }),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		isPrimary: boolean('is_primary').notNull().default(false)
	},
	(t) => [
		primaryKey({ columns: [t.leaseId, t.tenantId] }),
		index('lease_tenant_tenant_idx').on(t.tenantId)
	]
);

export const chargeKind = pgEnum('charge_kind', ['rent', 'deposit', 'fee', 'utility', 'other']);

/** Amounts are stored in minor units (cents). */
export const charge = pgTable(
	'charge',
	{
		id: id(),
		organizationId: orgId(),
		leaseId: text('lease_id')
			.notNull()
			.references(() => lease.id, { onDelete: 'cascade' }),
		kind: chargeKind('kind').notNull().default('rent'),
		description: text('description'),
		periodStart: date('period_start', { mode: 'string' }),
		dueDate: date('due_date', { mode: 'string' }).notNull(),
		amount: integer('amount').notNull(),
		/** The rent charge a late fee was assessed on. */
		appliesToChargeId: text('applies_to_charge_id'),
		...timestamps
	},
	(t) => [
		index('charge_org_due_idx').on(t.organizationId, t.dueDate),
		index('charge_lease_idx').on(t.leaseId),
		uniqueIndex('charge_rent_period_idx')
			.on(t.leaseId, t.periodStart)
			.where(sql`${t.kind} = 'rent'`),
		uniqueIndex('charge_late_fee_idx')
			.on(t.appliesToChargeId)
			.where(sql`${t.kind} = 'fee'`)
	]
);

export const paymentMethod = pgEnum('payment_method', [
	'ach',
	'card',
	'check',
	'cash',
	'transfer',
	'other'
]);

export const payment = pgTable(
	'payment',
	{
		id: id(),
		organizationId: orgId(),
		leaseId: text('lease_id')
			.notNull()
			.references(() => lease.id, { onDelete: 'cascade' }),
		chargeId: text('charge_id').references(() => charge.id, { onDelete: 'set null' }),
		amount: integer('amount').notNull(),
		receivedOn: date('received_on', { mode: 'string' }).notNull(),
		method: paymentMethod('method').notNull().default('ach'),
		reference: text('reference'),
		notes: text('notes'),
		recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [
		index('payment_org_received_idx').on(t.organizationId, t.receivedOn),
		index('payment_lease_idx').on(t.leaseId),
		index('payment_charge_idx').on(t.chargeId)
	]
);

export const ticketStatus = pgEnum('ticket_status', [
	'open',
	'in_progress',
	'on_hold',
	'done',
	'cancelled'
]);
export const ticketPriority = pgEnum('ticket_priority', ['low', 'normal', 'high', 'urgent']);

export const maintenanceTicket = pgTable(
	'maintenance_ticket',
	{
		id: id(),
		organizationId: orgId(),
		number: integer('number').notNull(),
		propertyId: text('property_id')
			.notNull()
			.references(() => property.id, { onDelete: 'cascade' }),
		unitId: text('unit_id').references(() => unit.id, { onDelete: 'set null' }),
		tenantId: text('tenant_id').references(() => tenant.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		description: text('description'),
		status: ticketStatus('status').notNull().default('open'),
		priority: ticketPriority('priority').notNull().default('normal'),
		assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
		vendor: text('vendor'),
		dueDate: date('due_date', { mode: 'string' }),
		closedAt: timestamp('closed_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		index('ticket_org_status_idx').on(t.organizationId, t.status),
		uniqueIndex('ticket_org_number_idx').on(t.organizationId, t.number)
	]
);

export const document = pgTable(
	'document',
	{
		id: id(),
		organizationId: orgId(),
		name: text('name').notNull(),
		contentType: text('content_type').notNull(),
		size: integer('size').notNull(),
		storageKey: text('storage_key').notNull(),
		entityType: text('entity_type'),
		entityId: text('entity_id'),
		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [index('document_entity_idx').on(t.organizationId, t.entityType, t.entityId)]
);

export const documentBlob = pgTable('document_blob', {
	storageKey: text('storage_key').primaryKey(),
	data: text('data').notNull()
});

export const activity = pgTable(
	'activity',
	{
		id: id(),
		organizationId: orgId(),
		actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id').notNull(),
		action: text('action').notNull(),
		summary: text('summary').notNull(),
		data: jsonb('data').$type<Record<string, unknown>>(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('activity_org_created_idx').on(t.organizationId, t.createdAt),
		index('activity_entity_idx').on(t.entityType, t.entityId)
	]
);

export const notificationSettings = pgTable('notification_settings', {
	organizationId: text('organization_id')
		.primaryKey()
		.references(() => organization.id, { onDelete: 'cascade' }),
	rentReminders: boolean('rent_reminders').notNull().default(true),
	reminderDaysBefore: integer('reminder_days_before').notNull().default(3),
	overdueNotices: boolean('overdue_notices').notNull().default(true),
	maintenanceUpdates: boolean('maintenance_updates').notNull().default(true),
	leaseExpiryAlerts: boolean('lease_expiry_alerts').notNull().default(true),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

/** One row per email sent, so each notice goes out once per recipient. */
export const notificationLog = pgTable(
	'notification_log',
	{
		id: id(),
		organizationId: orgId(),
		kind: text('kind').notNull(),
		entityId: text('entity_id').notNull(),
		recipient: text('recipient').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [uniqueIndex('notification_log_once_idx').on(t.kind, t.entityId, t.recipient)]
);

export const webhook = pgTable(
	'webhook',
	{
		id: id(),
		organizationId: orgId(),
		url: text('url').notNull(),
		secret: text('secret').notNull(),
		events: text('events')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		enabled: boolean('enabled').notNull().default(true),
		lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
		lastDeliveryStatus: integer('last_delivery_status'),
		...timestamps
	},
	(t) => [index('webhook_org_idx').on(t.organizationId)]
);

export const integrationInstall = pgTable(
	'integration_install',
	{
		id: id(),
		organizationId: orgId(),
		integrationId: text('integration_id').notNull(),
		config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
		enabled: boolean('enabled').notNull().default(true),
		...timestamps
	},
	(t) => [uniqueIndex('integration_install_org_idx').on(t.organizationId, t.integrationId)]
);
