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
import type { ProfileData, SharedProfile } from '../../profile.ts';
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
		/** Shown on the public property page. */
		marketingDescription: text('marketing_description').notNull().default(''),
		amenities: text('amenities')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		/** The public page is also shown whenever the property has a published listing. */
		publicPage: boolean('public_page').notNull().default(false),
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
		/** Resident chose to keep this record's contact details in sync with their Leroa Profile. */
		profileSync: boolean('profile_sync').notNull().default(false),
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
	'bilt',
	'paypal',
	'direct_debit',
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
		/** Provider payment ID (e.g. a Stripe PaymentIntent) for payments made online. */
		externalId: text('external_id'),
		...timestamps
	},
	(t) => [
		index('payment_org_received_idx').on(t.organizationId, t.receivedOn),
		uniqueIndex('payment_external_idx').on(t.externalId),
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

export const vendor = pgTable(
	'vendor',
	{
		id: id(),
		organizationId: orgId(),
		name: text('name').notNull(),
		contactName: text('contact_name'),
		email: text('email'),
		phone: text('phone'),
		trades: text('trades')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		notes: text('notes'),
		insuranceExpiresOn: date('insurance_expires_on', { mode: 'string' }),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [index('vendor_org_idx').on(t.organizationId, t.name)]
);

export const assetKind = pgEnum('asset_kind', [
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
]);

/** Equipment worth tracking — tied to a property or a unit. */
export const asset = pgTable(
	'asset',
	{
		id: id(),
		organizationId: orgId(),
		propertyId: text('property_id')
			.notNull()
			.references(() => property.id, { onDelete: 'cascade' }),
		unitId: text('unit_id').references(() => unit.id, { onDelete: 'set null' }),
		vendorId: text('vendor_id').references(() => vendor.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		kind: assetKind('kind').notNull().default('other'),
		make: text('make'),
		model: text('model'),
		serialNumber: text('serial_number'),
		installedOn: date('installed_on', { mode: 'string' }),
		warrantyExpiresOn: date('warranty_expires_on', { mode: 'string' }),
		notes: text('notes'),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		index('asset_org_idx').on(t.organizationId),
		index('asset_property_idx').on(t.propertyId),
		index('asset_unit_idx').on(t.unitId)
	]
);

export const pmInterval = pgEnum('pm_interval', ['weeks', 'months', 'years']);

/** Recurring preventive-maintenance schedule; the cron issues a work order when a run comes due. */
export const pmSchedule = pgTable(
	'pm_schedule',
	{
		id: id(),
		organizationId: orgId(),
		propertyId: text('property_id')
			.notNull()
			.references(() => property.id, { onDelete: 'cascade' }),
		unitId: text('unit_id').references(() => unit.id, { onDelete: 'set null' }),
		assetId: text('asset_id').references(() => asset.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		description: text('description'),
		priority: ticketPriority('priority').notNull().default('normal'),
		vendorId: text('vendor_id').references(() => vendor.id, { onDelete: 'set null' }),
		assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
		/** Run every `every` × `interval`, e.g. every 3 months. */
		every: integer('every').notNull().default(1),
		interval: pmInterval('interval').notNull().default('months'),
		/** The next service date; the work order's due date. */
		nextRunOn: date('next_run_on', { mode: 'string' }).notNull(),
		lastRunOn: date('last_run_on', { mode: 'string' }),
		/** Issue the work order this many days before the service is due. */
		leadDays: integer('lead_days').notNull().default(7),
		enabled: boolean('enabled').notNull().default(true),
		...timestamps
	},
	(t) => [
		index('pm_schedule_org_idx').on(t.organizationId, t.enabled),
		index('pm_schedule_property_idx').on(t.propertyId)
	]
);

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
		vendorId: text('vendor_id').references(() => vendor.id, { onDelete: 'set null' }),
		assetId: text('asset_id').references(() => asset.id, { onDelete: 'set null' }),
		/** The preventive schedule that issued this work order, if any. */
		scheduleId: text('schedule_id').references(() => pmSchedule.id, { onDelete: 'set null' }),
		/** What the work cost, in cents, as reported by staff or the vendor. */
		costAmount: integer('cost_amount'),
		vendorSentAt: timestamp('vendor_sent_at', { withTimezone: true }),
		dueDate: date('due_date', { mode: 'string' }),
		closedAt: timestamp('closed_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		index('ticket_org_status_idx').on(t.organizationId, t.status),
		uniqueIndex('ticket_org_number_idx').on(t.organizationId, t.number),
		index('ticket_vendor_idx').on(t.vendorId)
	]
);

export const ticketAuthor = pgEnum('ticket_author', ['staff', 'vendor', 'tenant']);

export const ticketNote = pgTable(
	'ticket_note',
	{
		id: id(),
		organizationId: orgId(),
		ticketId: text('ticket_id')
			.notNull()
			.references(() => maintenanceTicket.id, { onDelete: 'cascade' }),
		authorType: ticketAuthor('author_type').notNull(),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		vendorId: text('vendor_id').references(() => vendor.id, { onDelete: 'set null' }),
		authorName: text('author_name').notNull(),
		body: text('body').notNull(),
		/** Staff-only; hidden from vendors and tenants. */
		internal: boolean('internal').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('ticket_note_ticket_idx').on(t.ticketId, t.createdAt)]
);

export const turnStage = pgEnum('turn_stage', ['move_out', 'make_ready', 'listed', 'done']);

/** A unit's trip from move-out to re-leased. Completing a lease on the unit marks it done. */
export const unitTurn = pgTable(
	'unit_turn',
	{
		id: id(),
		organizationId: orgId(),
		unitId: text('unit_id')
			.notNull()
			.references(() => unit.id, { onDelete: 'cascade' }),
		leaseId: text('lease_id').references(() => lease.id, { onDelete: 'set null' }),
		stage: turnStage('stage').notNull().default('move_out'),
		moveOutOn: date('move_out_on', { mode: 'string' }),
		targetReadyOn: date('target_ready_on', { mode: 'string' }),
		notes: text('notes'),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		index('unit_turn_org_idx').on(t.organizationId, t.stage),
		uniqueIndex('unit_turn_open_idx')
			.on(t.organizationId, t.unitId)
			.where(sql`${t.completedAt} is null`)
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
	vendorInsuranceAlerts: boolean('vendor_insurance_alerts').notNull().default(true),
	newApplications: boolean('new_applications').notNull().default(true),
	newLeads: boolean('new_leads').notNull().default(true),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

/** A workspace's settings for one online payment provider (`stripe`, `bilt`, …). */
export const paymentProvider = pgTable(
	'payment_provider',
	{
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		enabled: boolean('enabled').notNull().default(false),
		/** The workspace's own account with the provider, e.g. a Stripe Connect account. */
		accountId: text('account_id'),
		accountReady: boolean('account_ready').notNull().default(false),
		updatedAt: timestamp('updated_at', { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(t) => [
		primaryKey({ columns: [t.organizationId, t.provider] }),
		index('payment_provider_account_idx').on(t.provider, t.accountId)
	]
);

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

/** One in-app notification for one workspace member, deduped per (kind, entity, user). */
export const inboxItem = pgTable(
	'inbox_item',
	{
		id: id(),
		organizationId: orgId(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		entityId: text('entity_id').notNull(),
		title: text('title').notNull(),
		body: text('body'),
		href: text('href'),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		uniqueIndex('inbox_item_once_idx').on(t.kind, t.entityId, t.userId),
		index('inbox_item_user_idx').on(t.userId, t.organizationId, t.createdAt)
	]
);

/** A named, workspace-shared list configuration (filters + sort) a member can apply later. */
export const savedView = pgTable(
	'saved_view',
	{
		id: id(),
		organizationId: orgId(),
		/** List key the view belongs to: 'tenants', 'vendors', 'rent', … */
		page: text('page').notNull(),
		name: text('name').notNull(),
		state: jsonb('state').$type<Record<string, unknown>>().notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [
		index('saved_view_org_page_idx').on(t.organizationId, t.page),
		uniqueIndex('saved_view_name_idx').on(t.organizationId, t.page, t.name)
	]
);

/** Admin-defined extra field attached to an entity type (Twenty-style custom fields). */
export const customField = pgTable(
	'custom_field',
	{
		id: id(),
		organizationId: orgId(),
		/** Entity key: 'tenant' | 'property' | 'lease' | 'vendor' | 'owner' | 'ticket' */
		entity: text('entity').notNull(),
		name: text('name').notNull(),
		/** 'text' | 'number' | 'date' | 'select' | 'checkbox' */
		type: text('type').notNull().default('text'),
		/** Choices for type='select'. */
		options: jsonb('options').$type<string[]>(),
		position: integer('position').notNull().default(0),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		index('custom_field_org_entity_idx').on(t.organizationId, t.entity),
		uniqueIndex('custom_field_name_idx').on(t.organizationId, t.entity, t.name)
	]
);

export const customFieldValue = pgTable(
	'custom_field_value',
	{
		id: id(),
		fieldId: text('field_id')
			.notNull()
			.references(() => customField.id, { onDelete: 'cascade' }),
		recordId: text('record_id').notNull(),
		value: text('value'),
		...timestamps
	},
	(t) => [
		uniqueIndex('custom_field_value_once_idx').on(t.fieldId, t.recordId),
		index('custom_field_value_record_idx').on(t.recordId)
	]
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

/** An OAuth connection to an integration. Tokens are encrypted (see integrations/seal.ts). */
export const integrationConnection = pgTable(
	'integration_connection',
	{
		organizationId: text('organization_id')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		integrationId: text('integration_id').notNull(),
		accessToken: text('access_token').notNull(),
		refreshToken: text('refresh_token'),
		expiresAt: timestamp('expires_at', { withTimezone: true }),
		params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
		/** The connected account, e.g. a QuickBooks company ID. Sync links are kept per account. */
		account: text('account').notNull().default(''),
		accountName: text('account_name'),
		status: text('status').$type<'connected' | 'reconnect'>().notNull().default('connected'),
		connectedBy: text('connected_by').references(() => user.id, { onDelete: 'set null' }),
		syncStartedAt: timestamp('sync_started_at', { withTimezone: true }),
		lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
		lastSyncResult: jsonb('last_sync_result').$type<{
			synced: number;
			skipped: number;
			failed: number;
			removed: number;
			remaining: number;
		}>(),
		lastError: text('last_error'),
		...timestamps
	},
	(t) => [primaryKey({ columns: [t.organizationId, t.integrationId] })]
);

/** Which external record a Leroa record was synced to, or why it wasn't. */
export const integrationLink = pgTable(
	'integration_link',
	{
		id: id(),
		organizationId: orgId(),
		integrationId: text('integration_id').notNull(),
		account: text('account').notNull().default(''),
		entityType: text('entity_type').$type<'tenant' | 'charge' | 'payment'>().notNull(),
		entityId: text('entity_id').notNull(),
		externalId: text('external_id'),
		status: text('status').$type<'synced' | 'skipped' | 'failed'>().notNull(),
		error: text('error'),
		...timestamps
	},
	(t) => [
		uniqueIndex('integration_link_entity_idx').on(
			t.organizationId,
			t.integrationId,
			t.account,
			t.entityType,
			t.entityId
		),
		index('integration_link_status_idx').on(t.organizationId, t.integrationId, t.status)
	]
);

export const leaseTemplate = pgTable(
	'lease_template',
	{
		id: id(),
		organizationId: orgId(),
		name: text('name').notNull(),
		body: text('body').notNull(),
		...timestamps
	},
	(t) => [index('lease_template_org_idx').on(t.organizationId, t.name)]
);

export const agreementStatus = pgEnum('agreement_status', ['draft', 'sent', 'signed', 'void']);

/** A lease document rendered from a template. The body is frozen once sent for signature. */
export const leaseAgreement = pgTable(
	'lease_agreement',
	{
		id: id(),
		organizationId: orgId(),
		leaseId: text('lease_id')
			.notNull()
			.references(() => lease.id, { onDelete: 'cascade' }),
		templateId: text('template_id').references(() => leaseTemplate.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		body: text('body').notNull(),
		status: agreementStatus('status').notNull().default('draft'),
		/** SHA-256 of the body at the time it was sent. */
		contentHash: text('content_hash'),
		sentAt: timestamp('sent_at', { withTimezone: true }),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		documentId: text('document_id').references(() => document.id, { onDelete: 'set null' }),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [index('lease_agreement_lease_idx').on(t.organizationId, t.leaseId)]
);

/** One row per tenant who must sign, created when the agreement is sent. */
export const agreementSigner = pgTable(
	'agreement_signer',
	{
		agreementId: text('agreement_id')
			.notNull()
			.references(() => leaseAgreement.id, { onDelete: 'cascade' }),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		email: text('email'),
		signedName: text('signed_name'),
		signedAt: timestamp('signed_at', { withTimezone: true }),
		signedByUserId: text('signed_by_user_id').references(() => user.id, { onDelete: 'set null' }),
		ip: text('ip'),
		userAgent: text('user_agent')
	},
	(t) => [
		primaryKey({ columns: [t.agreementId, t.tenantId] }),
		index('agreement_signer_tenant_idx').on(t.tenantId)
	]
);

export const listingStatus = pgEnum('listing_status', ['draft', 'published', 'closed']);

/** A public advertisement for a unit, with an online application form while published. */
export const listing = pgTable(
	'listing',
	{
		id: id(),
		organizationId: orgId(),
		unitId: text('unit_id')
			.notNull()
			.references(() => unit.id, { onDelete: 'cascade' }),
		status: listingStatus('status').notNull().default('draft'),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		rentAmount: integer('rent_amount').notNull(),
		depositAmount: integer('deposit_amount').notNull().default(0),
		currency: text('currency').notNull().default('USD'),
		availableOn: date('available_on', { mode: 'string' }),
		leaseTermMonths: integer('lease_term_months'),
		petPolicy: text('pet_policy'),
		amenities: text('amenities')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		publishedAt: timestamp('published_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		index('listing_org_status_idx').on(t.organizationId, t.status),
		uniqueIndex('listing_open_unit_idx')
			.on(t.unitId)
			.where(sql`${t.status} <> 'closed'`)
	]
);

export const applicationStatus = pgEnum('application_status', [
	'new',
	'reviewing',
	'approved',
	'declined',
	'withdrawn'
]);

/**
 * A rental application submitted from a public listing. Deliberately collects no protected-class
 * data, SSNs or dates of birth; screening belongs to a partner integration.
 */
export const rentalApplication = pgTable(
	'rental_application',
	{
		id: id(),
		organizationId: orgId(),
		listingId: text('listing_id').references(() => listing.id, { onDelete: 'set null' }),
		unitId: text('unit_id').references(() => unit.id, { onDelete: 'set null' }),
		status: applicationStatus('status').notNull().default('new'),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		email: text('email').notNull(),
		phone: text('phone'),
		moveInDate: date('move_in_date', { mode: 'string' }),
		occupants: integer('occupants').notNull().default(1),
		pets: text('pets'),
		employer: text('employer'),
		monthlyIncome: integer('monthly_income'),
		currentAddress: text('current_address'),
		message: text('message'),
		/** Internal notes, never shown to the applicant. */
		notes: text('notes'),
		consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
		ip: text('ip'),
		userAgent: text('user_agent'),
		decidedAt: timestamp('decided_at', { withTimezone: true }),
		decidedBy: text('decided_by').references(() => user.id, { onDelete: 'set null' }),
		tenantId: text('tenant_id').references(() => tenant.id, { onDelete: 'set null' }),
		leaseId: text('lease_id').references(() => lease.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [
		index('application_org_status_idx').on(t.organizationId, t.status, t.createdAt),
		index('application_listing_idx').on(t.listingId),
		index('application_email_idx').on(t.listingId, t.email)
	]
);

export const leadStage = pgEnum('lead_stage', [
	'new',
	'contacted',
	'touring',
	'applied',
	'leased',
	'lost'
]);
export const leadSource = pgEnum('lead_source', [
	'website',
	'listing',
	'application',
	'phone',
	'email',
	'walk_in',
	'referral',
	'listing_site',
	'api',
	'other'
]);

/** A prospective resident moving through the leasing pipeline. */
export const lead = pgTable(
	'lead',
	{
		id: id(),
		organizationId: orgId(),
		stage: leadStage('stage').notNull().default('new'),
		source: leadSource('source').notNull().default('other'),
		/** Free text, e.g. which listing site or who referred them. */
		sourceDetail: text('source_detail'),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull().default(''),
		email: text('email'),
		phone: text('phone'),
		propertyId: text('property_id').references(() => property.id, { onDelete: 'set null' }),
		listingId: text('listing_id').references(() => listing.id, { onDelete: 'set null' }),
		moveInDate: date('move_in_date', { mode: 'string' }),
		bedrooms: integer('bedrooms'),
		budgetMax: integer('budget_max'),
		message: text('message'),
		assignedTo: text('assigned_to').references(() => user.id, { onDelete: 'set null' }),
		nextFollowUpOn: date('next_follow_up_on', { mode: 'string' }),
		lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
		/** Waiting for a home that matches `propertyId` and `bedrooms` to come up. */
		waitlist: boolean('waitlist').notNull().default(false),
		waitlistedAt: timestamp('waitlisted_at', { withTimezone: true }),
		lostReason: text('lost_reason'),
		applicationId: text('application_id').references(() => rentalApplication.id, {
			onDelete: 'set null'
		}),
		tenantId: text('tenant_id').references(() => tenant.id, { onDelete: 'set null' }),
		/** When the prospect agreed to be contacted from a public form. */
		consentAt: timestamp('consent_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		index('lead_org_stage_idx').on(t.organizationId, t.stage, t.createdAt),
		index('lead_org_email_idx').on(t.organizationId, t.email),
		index('lead_org_follow_up_idx').on(t.organizationId, t.nextFollowUpOn),
		index('lead_waitlist_idx').on(t.organizationId, t.waitlist)
	]
);

export const leadNoteKind = pgEnum('lead_note_kind', ['note', 'call', 'email', 'text', 'inquiry']);

/** Notes and logged contact attempts on a lead. Stage changes and tours live in `activity`. */
export const leadNote = pgTable(
	'lead_note',
	{
		id: id(),
		organizationId: orgId(),
		leadId: text('lead_id')
			.notNull()
			.references(() => lead.id, { onDelete: 'cascade' }),
		kind: leadNoteKind('kind').notNull().default('note'),
		body: text('body').notNull(),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('lead_note_lead_idx').on(t.leadId, t.createdAt)]
);

export const tourKind = pgEnum('tour_kind', ['in_person', 'virtual', 'self_guided']);
export const tourStatus = pgEnum('tour_status', ['scheduled', 'completed', 'no_show', 'cancelled']);

export const tour = pgTable(
	'tour',
	{
		id: id(),
		organizationId: orgId(),
		leadId: text('lead_id')
			.notNull()
			.references(() => lead.id, { onDelete: 'cascade' }),
		propertyId: text('property_id')
			.notNull()
			.references(() => property.id, { onDelete: 'cascade' }),
		listingId: text('listing_id').references(() => listing.id, { onDelete: 'set null' }),
		startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
		durationMinutes: integer('duration_minutes').notNull().default(30),
		kind: tourKind('kind').notNull().default('in_person'),
		status: tourStatus('status').notNull().default('scheduled'),
		agentId: text('agent_id').references(() => user.id, { onDelete: 'set null' }),
		/** Booked by the prospect from a public page rather than by staff. */
		selfBooked: boolean('self_booked').notNull().default(false),
		notes: text('notes'),
		...timestamps
	},
	(t) => [
		index('tour_org_starts_idx').on(t.organizationId, t.startsAt),
		index('tour_lead_idx').on(t.leadId),
		index('tour_property_starts_idx').on(t.propertyId, t.startsAt)
	]
);

/** Per-workspace leasing settings: when prospects may book their own tours. */
export const leasingSettings = pgTable('leasing_settings', {
	organizationId: text('organization_id')
		.primaryKey()
		.references(() => organization.id, { onDelete: 'cascade' }),
	selfBooking: boolean('self_booking').notNull().default(false),
	timezone: text('timezone').notNull().default('UTC'),
	/** 0 = Sunday … 6 = Saturday. */
	tourDays: integer('tour_days')
		.array()
		.notNull()
		.default(sql`'{1,2,3,4,5,6}'::integer[]`),
	/** Minutes after local midnight. */
	tourStart: integer('tour_start').notNull().default(600),
	tourEnd: integer('tour_end').notNull().default(1080),
	slotMinutes: integer('slot_minutes').notNull().default(30),
	/** Minimum hours between booking and the tour. */
	noticeHours: integer('notice_hours').notNull().default(12),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date())
});

export const inspectionKind = pgEnum('inspection_kind', ['move_in', 'move_out', 'routine']);
export const inspectionStatus = pgEnum('inspection_status', ['in_progress', 'completed']);
export const itemCondition = pgEnum('item_condition', ['good', 'fair', 'poor', 'damaged', 'na']);

/** A walkthrough of one unit. Completed inspections are frozen and stored as a PDF. */
export const inspection = pgTable(
	'inspection',
	{
		id: id(),
		organizationId: orgId(),
		unitId: text('unit_id')
			.notNull()
			.references(() => unit.id, { onDelete: 'cascade' }),
		leaseId: text('lease_id').references(() => lease.id, { onDelete: 'set null' }),
		kind: inspectionKind('kind').notNull(),
		status: inspectionStatus('status').notNull().default('in_progress'),
		scheduledFor: date('scheduled_for', { mode: 'string' }),
		summary: text('summary'),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		completedBy: text('completed_by').references(() => user.id, { onDelete: 'set null' }),
		documentId: text('document_id').references(() => document.id, { onDelete: 'set null' }),
		/** Set when a tenant on the lease reviews the completed report in the portal. */
		acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
		acknowledgedBy: text('acknowledged_by').references(() => user.id, { onDelete: 'set null' }),
		tenantComment: text('tenant_comment'),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		...timestamps
	},
	(t) => [
		index('inspection_org_idx').on(t.organizationId, t.status),
		index('inspection_lease_idx').on(t.leaseId),
		index('inspection_unit_idx').on(t.unitId)
	]
);

export const inspectionItem = pgTable(
	'inspection_item',
	{
		id: id(),
		organizationId: orgId(),
		inspectionId: text('inspection_id')
			.notNull()
			.references(() => inspection.id, { onDelete: 'cascade' }),
		area: text('area').notNull(),
		label: text('label').notNull(),
		condition: itemCondition('condition'),
		notes: text('notes'),
		position: integer('position').notNull().default(0)
	},
	(t) => [index('inspection_item_inspection_idx').on(t.inspectionId, t.position)]
);

/** A broadcast to residents of one property, or of every property when `propertyId` is null. */
export const announcement = pgTable(
	'announcement',
	{
		id: id(),
		organizationId: orgId(),
		propertyId: text('property_id').references(() => property.id, { onDelete: 'cascade' }),
		subject: text('subject').notNull(),
		body: text('body').notNull(),
		emailed: boolean('emailed').notNull().default(false),
		recipientCount: integer('recipient_count').notNull().default(0),
		sentBy: text('sent_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('announcement_org_idx').on(t.organizationId, t.createdAt)]
);

export const messageAuthor = pgEnum('message_author', ['staff', 'tenant']);

/** One conversation per tenant between the resident and the management team. */
export const messageThread = pgTable(
	'message_thread',
	{
		id: id(),
		organizationId: orgId(),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenant.id, { onDelete: 'cascade' }),
		lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
		lastAuthorType: messageAuthor('last_author_type').notNull(),
		preview: text('preview').notNull().default(''),
		staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
		tenantReadAt: timestamp('tenant_read_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		uniqueIndex('message_thread_tenant_idx').on(t.tenantId),
		index('message_thread_org_idx').on(t.organizationId, t.lastMessageAt)
	]
);

export const message = pgTable(
	'message',
	{
		id: id(),
		organizationId: orgId(),
		threadId: text('thread_id')
			.notNull()
			.references(() => messageThread.id, { onDelete: 'cascade' }),
		authorType: messageAuthor('author_type').notNull(),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		authorName: text('author_name').notNull(),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('message_thread_created_idx').on(t.threadId, t.createdAt)]
);

/** A property owner (landlord or investor) who gets a read-only view of their properties. */
export const owner = pgTable(
	'owner',
	{
		id: id(),
		organizationId: orgId(),
		name: text('name').notNull(),
		email: text('email'),
		phone: text('phone'),
		notes: text('notes'),
		portalUserId: text('portal_user_id').references(() => user.id, { onDelete: 'set null' }),
		archivedAt: timestamp('archived_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [
		index('owner_org_idx').on(t.organizationId, t.name),
		index('owner_portal_user_idx').on(t.portalUserId)
	]
);

export const propertyOwner = pgTable(
	'property_owner',
	{
		propertyId: text('property_id')
			.notNull()
			.references(() => property.id, { onDelete: 'cascade' }),
		ownerId: text('owner_id')
			.notNull()
			.references(() => owner.id, { onDelete: 'cascade' })
	},
	(t) => [
		primaryKey({ columns: [t.propertyId, t.ownerId] }),
		index('property_owner_owner_idx').on(t.ownerId)
	]
);

/** Leroa Profile service (LEROA_PROFILE_HUB): one portable profile per resident account. */
export const residentProfile = pgTable('resident_profile', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	data: jsonb('data').$type<ProfileData>().notNull(),
	...timestamps
});

/** An install (identified by its origin) a resident has shared their profile with. */
export const profileGrant = pgTable(
	'profile_grant',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		clientId: text('client_id').notNull(),
		scopes: text('scopes').array().notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
		...timestamps
	},
	(t) => [uniqueIndex('profile_grant_user_client_idx').on(t.userId, t.clientId)]
);

/** Access tokens are stored hashed. Revoking a grant removes all of them. */
export const profileToken = pgTable(
	'profile_token',
	{
		tokenHash: text('token_hash').primaryKey(),
		grantId: text('grant_id')
			.notNull()
			.references(() => profileGrant.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('profile_token_grant_idx').on(t.grantId)]
);

/** Single-use authorization codes, bound to a PKCE challenge and redirect. */
export const profileCode = pgTable('profile_code', {
	codeHash: text('code_hash').primaryKey(),
	grantId: text('grant_id')
		.notNull()
		.references(() => profileGrant.id, { onDelete: 'cascade' }),
	codeChallenge: text('code_challenge').notNull(),
	redirectUri: text('redirect_uri').notNull(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

/** Install side: a local account's connection to a Leroa Profile service. */
export const profileLink = pgTable('profile_link', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	hubUrl: text('hub_url').notNull(),
	/** Sealed with the server secret. */
	accessToken: text('access_token').notNull(),
	scopes: text('scopes').array().notNull(),
	data: jsonb('data').$type<SharedProfile>().notNull(),
	syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
