import { error } from '@sveltejs/kit';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { allows, API_RESOURCES, type ApiAction, type ApiResource } from '#lib/api-permissions.ts';
import { requireOrg, requirePerm, type OrgContext } from './context.ts';

export type RecordEntity =
	| ApiResource
	| 'agreement'
	| 'inspection_item'
	| 'clause'
	| 'critical_date'
	| 'ti_item'
	| 'amenity'
	| 'booking'
	| 'package'
	| 'permit'
	| 'key'
	| 'pass'
	| 'event'
	| 'survey';

// SQL identifiers below are repository constants, never caller-supplied names.
const direct = {
	tickets: 'maintenance_ticket',
	assets: 'asset',
	schedules: 'pm_schedule',
	leads: 'lead',
	tours: 'tour',
	announcements: 'announcement',
	amenity: 'amenity',
	package: 'package_log',
	permit: 'parking_permit',
	key: 'key_record',
	pass: 'guest_pass',
	event: 'community_event',
	survey: 'survey'
} as const;
const throughUnit = {
	leases: 'lease',
	turns: 'unit_turn',
	listings: 'listing',
	inspections: 'inspection'
} as const;
const throughLease = {
	charges: 'charge',
	payments: 'payment',
	agreement: 'lease_agreement',
	clause: 'lease_clause',
	critical_date: 'lease_critical_date',
	ti_item: 'lease_ti_item'
} as const;

export function assertPermission(
	ctx: OrgContext,
	resource: ApiResource,
	action: ApiAction = 'read'
) {
	if (ctx.perms && !allows(ctx.perms, resource, action)) error(403, 'Insufficient permissions');
}

/** Unclassified workspace data cannot safely be attributed to a narrower resource grant. */
export function assertWorkspaceDataAccess(ctx: OrgContext, action: ApiAction = 'read') {
	if (ctx.propertyIds || (ctx.perms && API_RESOURCES.some((r) => !allows(ctx.perms, r, action))))
		error(403, 'Operation requires full workspace access');
}

const entityAccess = {
	property: ['properties', 'properties'],
	unit: ['units', 'units'],
	tenant: ['tenants', 'tenants'],
	lease: ['leases', 'leases'],
	maintenance: ['tickets', 'tickets'],
	ticket: ['tickets', 'tickets'],
	vendor: ['vendors', 'vendors'],
	asset: ['assets', 'assets'],
	owner: ['owners', 'owners'],
	listing: ['listings', 'listings'],
	application: ['applications', 'applications'],
	lead: ['leads', 'leads'],
	tour: ['tours', 'tours'],
	inspection: ['inspections', 'inspections'],
	inspection_item: ['inspections', 'inspection_item'],
	agreement: ['leases', 'agreement']
} as const;

export async function assertEntityAccess(
	ctx: OrgContext,
	type: string | null,
	id: string | null,
	action: ApiAction = 'read'
) {
	if (!type && !id) {
		assertWorkspaceDataAccess(ctx, action);
		return;
	}
	const mapping = entityAccess[type as keyof typeof entityAccess];
	if (!mapping || !id) error(400, 'Unsupported entity');
	assertPermission(ctx, mapping[0], action);
	await assertRecordAccess(ctx, mapping[1], id);
}

/** Published pages retain anonymous access; unpublished preview requires actual staff authorization. */
export async function staffOrgForRecord(
	ctx: OrgContext | null,
	resource: ApiResource,
	entity: RecordEntity,
	id: string
) {
	if (!ctx || (ctx.perms && !allows(ctx.perms, resource, 'read'))) return null;
	return (await canAccessRecord(ctx, entity, id)) ? ctx.orgId : null;
}

async function recordProperties(
	ctx: OrgContext,
	entity: RecordEntity,
	id: string
): Promise<(string | null)[]> {
	let query: SQL;
	if (entity === 'properties')
		query = sql`select id as property_id from property where id=${id} and organization_id=${ctx.orgId}`;
	else if (entity === 'units')
		query = sql`select property_id from unit where id=${id} and organization_id=${ctx.orgId}`;
	else if (entity === 'vendors')
		query = sql`select null::text as property_id from vendor where id=${id} and organization_id=${ctx.orgId}`;
	else if (entity === 'tenants' || entity === 'messages')
		query = sql`select u.property_id from tenant t left join lease_tenant lt on lt.tenant_id=t.id left join lease l on l.id=lt.lease_id and l.organization_id=t.organization_id left join unit u on u.id=l.unit_id and u.organization_id=t.organization_id where t.id=${id} and t.organization_id=${ctx.orgId}`;
	else if (entity === 'owners')
		query = sql`select p.id as property_id from owner o left join property_owner po on po.owner_id=o.id left join property p on p.id=po.property_id and p.organization_id=o.organization_id where o.id=${id} and o.organization_id=${ctx.orgId}`;
	else if (entity === 'leads')
		query = sql`select property_id from lead where id=${id} and organization_id=${ctx.orgId} union all select property_id from tour where lead_id=${id} and organization_id=${ctx.orgId}`;
	else if (entity === 'applications')
		query = sql`select u.property_id from rental_application a join listing l on l.id=a.listing_id and l.organization_id=a.organization_id join unit u on u.id=l.unit_id and u.organization_id=a.organization_id where a.id=${id} and a.organization_id=${ctx.orgId}`;
	else if (entity === 'inspection_item')
		query = sql`select u.property_id from inspection_item x join inspection i on i.id=x.inspection_id and i.organization_id=x.organization_id join unit u on u.id=i.unit_id and u.organization_id=x.organization_id where x.id=${id} and x.organization_id=${ctx.orgId}`;
	else if (entity === 'booking')
		query = sql`select a.property_id from amenity_booking b join amenity a on a.id=b.amenity_id and a.organization_id=b.organization_id where b.id=${id} and b.organization_id=${ctx.orgId}`;
	else if (entity in direct) {
		const table = sql.raw(direct[entity as keyof typeof direct]);
		query = sql`select property_id from ${table} where id=${id} and organization_id=${ctx.orgId}`;
	} else if (entity in throughUnit) {
		const table = sql.raw(throughUnit[entity as keyof typeof throughUnit]);
		query = sql`select u.property_id from ${table} x join unit u on u.id=x.unit_id and u.organization_id=x.organization_id where x.id=${id} and x.organization_id=${ctx.orgId}`;
	} else if (entity in throughLease) {
		const table = sql.raw(throughLease[entity as keyof typeof throughLease]);
		query = sql`select u.property_id from ${table} x join lease l on l.id=x.lease_id and l.organization_id=x.organization_id join unit u on u.id=l.unit_id and u.organization_id=x.organization_id where x.id=${id} and x.organization_id=${ctx.orgId}`;
	} else error(404, 'Not found');
	const rows = (await db.execute(query)) as unknown as { property_id: string | null }[];
	return rows.map((row) => row.property_id);
}

export async function canAccessRecord(
	ctx: OrgContext,
	entity: RecordEntity,
	id: string,
	action: ApiAction = 'read'
) {
	const properties = await recordProperties(ctx, entity, id);
	return (
		properties.length > 0 &&
		(!ctx.propertyIds ||
			entity === 'vendors' ||
			(entity === 'announcements' && action === 'read' && properties.every((p) => p === null)) ||
			properties.every((p) => p !== null && ctx.propertyIds!.includes(p)))
	);
}

export async function assertRecordAccess(
	ctx: OrgContext,
	entity: RecordEntity,
	id: string,
	action: ApiAction = 'read'
) {
	if (!(await canAccessRecord(ctx, entity, id, action))) error(404, 'Not found');
	return ctx;
}

const associatedResource: Record<Exclude<RecordEntity, ApiResource>, ApiResource> = {
	agreement: 'leases',
	inspection_item: 'inspections',
	clause: 'leases',
	critical_date: 'leases',
	ti_item: 'leases',
	amenity: 'properties',
	booking: 'tenants',
	package: 'tenants',
	permit: 'tenants',
	key: 'tenants',
	pass: 'tenants',
	event: 'properties',
	survey: 'tenants'
};
function recordResource(entity: RecordEntity): ApiResource {
	return associatedResource[entity as keyof typeof associatedResource] ?? (entity as ApiResource);
}
export function hasReadAccess(ctx: OrgContext, resource: ApiResource) {
	return !ctx.perms || allows(ctx.perms, resource, 'read');
}
/** A portal claim grants persistent access to the whole tenant portal, across its associated properties. */
export function assertPortalDelegation(ctx: OrgContext) {
	if (ctx.propertyIds) error(403, 'Portal access requires all properties');
	for (const resource of [
		'tenants',
		'properties',
		'units',
		'leases',
		'charges',
		'payments',
		'tickets',
		'inspections',
		'messages',
		'announcements'
	] as const)
		assertPermission(ctx, resource);
}

export async function filterRecords<T>(
	ctx: OrgContext,
	entity: RecordEntity,
	rows: T[],
	key = 'id',
	resource: ApiResource = recordResource(entity)
): Promise<T[]> {
	if (!hasReadAccess(ctx, resource)) return [];
	if (!ctx.propertyIds) return rows;
	const visible = await Promise.all(
		rows.map((row) => {
			const id = (row as Record<string, unknown>)[key];
			return typeof id === 'string' ? canAccessRecord(ctx, entity, id) : false;
		})
	);
	return rows.filter((_, index) => visible[index]);
}

/** Authorize every submitted association independently; a permitted property cannot mask another target. */
export async function assertReferences(ctx: OrgContext, input: unknown) {
	if (!input || typeof input !== 'object') return;
	const data = input as Record<string, unknown>;
	const references = {
		propertyId: 'properties',
		unitId: 'units',
		leaseId: 'leases',
		tenantId: 'tenants',
		ticketId: 'tickets',
		inspectionId: 'inspections',
		itemId: 'inspection_item',
		listingId: 'listings',
		leadId: 'leads',
		amenityId: 'amenity',
		vendorId: 'vendors',
		assetId: 'assets',
		ownerId: 'owners'
	} as const;
	for (const [key, entity] of Object.entries(references)) {
		const id = data[key];
		if (typeof id === 'string') await assertRecordAccess(ctx, entity, id);
	}
	if (Array.isArray(data.tenantIds))
		for (const id of data.tenantIds) {
			if (typeof id !== 'string') error(400, 'Invalid tenant');
			await assertRecordAccess(ctx, 'tenants', id);
		}
	if (Array.isArray(data.propertyIds))
		for (const id of data.propertyIds) {
			if (typeof id !== 'string') error(400, 'Invalid property');
			await assertRecordAccess(ctx, 'properties', id);
		}
}

type Target = { entity: RecordEntity; key?: string; argument?: number };
export type OperationRule =
	| 'public'
	| 'internal'
	| {
			resource: ApiResource;
			anyRead?: ApiResource[];
			reads?: ApiResource[];
			action?: ApiAction;
			target?: Target;
			references?: boolean;
			list?: Target;
			/** An unassociated record is organization-wide and cannot be created from a property-scoped context. */
			globalWrite?: boolean;
			context?: boolean;
	  };
type FunctionKeys<T> = {
	[K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];
export type ServicePolicy<T> = Record<FunctionKeys<T>, OperationRule>;

/** Explicit contracts at the browser entrypoint, leaving public and background service callers unchanged. */
export function secureServices<T extends object>(services: T, policy: ServicePolicy<T>): T {
	const wrapped = { ...services };
	for (const [name, value] of Object.entries(services)) {
		if (typeof value !== 'function') continue;
		const rule = (policy as Record<string, OperationRule>)[name];
		if (!rule) throw new Error(`Missing access contract: ${name}`);
		if (rule === 'public') continue;
		(wrapped as Record<string, unknown>)[name] = async (...args: unknown[]) => {
			if (rule === 'internal') error(403, 'Internal operation');
			const ctx = rule.anyRead
				? await requireOrg()
				: await requirePerm(rule.resource, rule.action ?? 'read');
			if (rule.anyRead && ctx.perms && !rule.anyRead.some((r) => allows(ctx.perms, r, 'read')))
				error(403, 'Insufficient permissions');
			for (const resource of rule.reads ?? []) assertPermission(ctx, resource);
			if (rule.globalWrite && ctx.propertyIds) error(403, 'Operation requires all properties');
			if (rule.target) {
				const arg = args[rule.target.argument ?? 1];
				const id = rule.target.key ? (arg as Record<string, unknown>)?.[rule.target.key] : arg;
				if (typeof id !== 'string') error(400, 'Missing record');
				await assertRecordAccess(ctx, rule.target.entity, id, rule.action ?? 'read');
			}
			if (rule.references) await assertReferences(ctx, args[1]);
			const result = await value(...args, ...(rule.context ? [ctx] : []));
			return rule.list
				? filterRecords(ctx, rule.list.entity, result, rule.list.key, rule.resource)
				: result;
		};
	}
	return wrapped;
}
