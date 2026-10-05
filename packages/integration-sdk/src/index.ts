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
	handle: (event: LeroaEvent, ctx: IntegrationContext<C>) => Promise<void> | void;
};

export function defineIntegration<C extends Record<string, unknown>>(
	definition: IntegrationDefinition<C>
) {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(definition.id)) {
		throw new Error(`Integration id "${definition.id}" must be kebab-case`);
	}
	return definition;
}

export type IntegrationManifest = Omit<IntegrationDefinition, 'handle'>;

export function toManifest<C extends Record<string, unknown>>(
	definition: IntegrationDefinition<C>
): IntegrationManifest {
	const { handle: _handle, ...manifest } = definition;
	return manifest as IntegrationManifest;
}
