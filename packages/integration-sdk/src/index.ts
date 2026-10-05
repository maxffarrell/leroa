/**
 * Leroa integration SDK.
 *
 * An integration is a manifest plus event handlers. Integrations are contributed
 * to the public integrations repository, reviewed, and then bundled into every
 * Leroa install, where each workspace can enable and configure them.
 */

export const EVENT_TYPES = [
	'property.created',
	'property.updated',
	'property.deleted',
	'unit.created',
	'unit.updated',
	'tenant.created',
	'tenant.updated',
	'lease.created',
	'lease.updated',
	'charge.created',
	'payment.recorded',
	'maintenance.created',
	'maintenance.updated',
	'vendor.created',
	'vendor.updated',
	'inspection.created',
	'inspection.completed',
	'inspection.acknowledged',
	'message.created',
	'announcement.sent',
	'owner.created',
	'owner.updated',
	'import.completed',
	'listing.published',
	'listing.closed',
	'application.submitted',
	'application.approved',
	'application.declined'
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type LeroaEvent<T extends string = EventType> = {
	id: string;
	type: T;
	organizationId: string;
	entity: { type: string; id: string };
	summary: string;
	data: Record<string, unknown>;
	createdAt: string;
};

export type ConfigField =
	| {
			key: string;
			label: string;
			type: 'text' | 'url' | 'secret';
			required?: boolean;
			description?: string;
			placeholder?: string;
	  }
	| { key: string; label: string; type: 'boolean'; description?: string; default?: boolean }
	| {
			key: string;
			label: string;
			type: 'select';
			options: { value: string; label: string }[];
			required?: boolean;
			description?: string;
	  };

export type IntegrationContext<C> = {
	config: C;
	workspace: { id: string; name: string };
	/** Fetch with a timeout and a Leroa user-agent. */
	fetch: typeof fetch;
	log: (...args: unknown[]) => void;
};

/**
 * OAuth 2.0 authorization-code connection. Leroa runs the flow, keeps the tokens encrypted and
 * refreshes them; the app credentials come from the server's environment.
 */
export type OAuthSpec = {
	authorizeUrl: string;
	tokenUrl: string;
	revokeUrl?: string;
	scopes: string[];
	/** Callback query parameters to keep on the connection, e.g. QuickBooks' `realmId`. */
	callbackParams?: string[];
	/** Callback parameter naming the connected account; synced records are tracked per account. */
	accountParam?: string;
	/** How the revocation endpoint takes the token. Defaults to `form` (RFC 7009). */
	revokeBody?: 'form' | 'json';
	/** Display name of the connected account, e.g. the company name. */
	accountName?: (connection: Connection, fetcher: typeof fetch) => Promise<string | null>;
};

export type Connection = {
	accessToken: string;
	/** Kept callback parameters plus server-provided values such as `environment`. */
	params: Record<string, string>;
};

export type SyncEntityType = 'tenant' | 'charge' | 'payment';

export type SyncTenant = {
	id: string;
	/** Company name for companies, otherwise "First Last". */
	name: string;
	firstName: string;
	lastName: string;
	companyName: string | null;
	email: string | null;
	phone: string | null;
};

export type SyncCharge = {
	id: string;
	leaseId: string;
	/** The lease's primary tenant. */
	tenantId: string;
	kind: 'rent' | 'deposit' | 'fee' | 'utility' | 'other';
	description: string | null;
	periodStart: string | null;
	dueDate: string;
	/** Minor units. */
	amount: number;
	currency: string;
	property: string;
	unit: string;
};

export type SyncPayment = {
	id: string;
	leaseId: string;
	tenantId: string;
	/** The charge this payment was applied to; null for unapplied credit. */
	chargeId: string | null;
	chargeKind: SyncCharge['kind'] | null;
	chargeDueDate: string | null;
	/** Minor units. */
	amount: number;
	currency: string;
	receivedOn: string;
	method: string;
	reference: string | null;
};

export type SyncRecords = { tenant: SyncTenant; charge: SyncCharge; payment: SyncPayment };

/** `skip` leaves the record unsynced (it is offered again next run) and is shown as the reason. */
export type PushResult = { externalId: string } | { skip: string };

export type SyncContext<C> = IntegrationContext<C> & {
	connection: Connection;
	/** The external ID stored for a Leroa record that was already synced. */
	externalId(type: SyncEntityType, id: string): string | undefined;
	/** Scratch space shared by one sync run, e.g. for cached lookups. */
	cache: Map<string, unknown>;
};

/** Thrown from a sync to stop the whole run, e.g. when the connection was revoked. */
export class SyncFatalError extends Error {
	override name = 'SyncFatalError';
}

/** One-way sync from Leroa to an external system. */
export type SyncSpec<C> = {
	/** Records dated before this (YYYY-MM-DD) are never synced. */
	since?: (config: C) => string | null;
	/** Pushes one record and returns its ID in the external system. */
	push: <T extends SyncEntityType>(
		type: T,
		record: SyncRecords[T],
		ctx: SyncContext<C>
	) => Promise<PushResult>;
	/** Removes a record Leroa created, after it was deleted in Leroa. */
	remove?: (type: SyncEntityType, externalId: string, ctx: SyncContext<C>) => Promise<void>;
	/** Events that start a background sync. A daily sync always runs. */
	triggers?: EventType[];
};

export type IntegrationDefinition<C extends Record<string, unknown> = Record<string, unknown>> = {
	/** Stable kebab-case identifier, e.g. `slack`. */
	id: string;
	name: string;
	description: string;
	category:
		| 'communication'
		| 'payments'
		| 'screening'
		| 'accounting-export'
		| 'listings'
		| 'automation'
		| 'other';
	author: { name: string; url?: string };
	homepage?: string;
	/** Inline SVG markup or an https URL. */
	icon?: string;
	config: ConfigField[];
	events: EventType[];
	handle?: (event: LeroaEvent, ctx: IntegrationContext<C>) => Promise<void> | void;
	/** Config values for a new install, e.g. a date computed at connect time. */
	defaults?: () => Partial<C>;
	/** Returns a message when a saved config is invalid. */
	validate?: (config: C) => string | null;
	/** "Connect with…" sign-in instead of pasted credentials. */
	oauth?: OAuthSpec;
	sync?: SyncSpec<C>;
};

export function defineIntegration<C extends Record<string, unknown>>(
	definition: IntegrationDefinition<C>
) {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(definition.id)) {
		throw new Error(`Integration id "${definition.id}" must be kebab-case`);
	}
	return definition;
}

type Behaviour = 'handle' | 'oauth' | 'sync' | 'defaults' | 'validate';

export type IntegrationManifest = Omit<IntegrationDefinition, Behaviour> & {
	/** Connected with OAuth rather than configured with pasted credentials. */
	connects: boolean;
	syncs: boolean;
};

export function toManifest<C extends Record<string, unknown>>(
	definition: IntegrationDefinition<C>
): IntegrationManifest {
	const { handle: _h, oauth, sync, defaults: _d, validate: _v, ...manifest } = definition;
	return {
		...(manifest as Omit<IntegrationDefinition, Behaviour>),
		connects: !!oauth,
		syncs: !!sync
	};
}
