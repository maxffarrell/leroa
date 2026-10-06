import * as v from 'valibot';

export const API_RESOURCES = [
	'properties',
	'units',
	'tenants',
	'leases',
	'charges',
	'payments',
	'tickets',
	'vendors',
	'inspections',
	'messages',
	'announcements',
	'owners',
	'listings',
	'applications',
	'leads',
	'tours',
	'reports'
] as const;
export type ApiResource = (typeof API_RESOURCES)[number];

export const API_ACTIONS = ['read', 'write'] as const;
export type ApiAction = (typeof API_ACTIONS)[number];

export type ApiPermissions = Partial<Record<ApiResource, ApiAction[]>>;
export type AccessLevel = 'none' | 'read' | 'write';
type RawPermissions = Record<string, readonly string[] | undefined> | null | undefined;

export const API_RESOURCE_LABELS: Record<ApiResource, string> = {
	properties: 'Properties',
	units: 'Units',
	tenants: 'Tenants',
	leases: 'Leases',
	charges: 'Charges',
	payments: 'Payments',
	tickets: 'Maintenance tickets',
	vendors: 'Vendors',
	inspections: 'Inspections',
	messages: 'Tenant messages',
	announcements: 'Announcements',
	owners: 'Owners',
	listings: 'Listings',
	applications: 'Rental applications',
	leads: 'Leads',
	tours: 'Tours',
	reports: 'Reports'
};

const actionsFor = (level: Exclude<AccessLevel, 'none'>): ApiAction[] =>
	level === 'write' ? ['read', 'write'] : ['read'];

export function levelOf(permissions: RawPermissions, resource: ApiResource): AccessLevel {
	const actions = permissions?.[resource] ?? [];
	return actions.includes('write') ? 'write' : actions.includes('read') ? 'read' : 'none';
}

export function withLevel(
	permissions: ApiPermissions,
	resource: ApiResource,
	level: AccessLevel
): ApiPermissions {
	const next = { ...permissions };
	if (level === 'none') delete next[resource];
	else next[resource] = actionsFor(level);
	return next;
}

export const everything = (level: Exclude<AccessLevel, 'none'>): ApiPermissions =>
	Object.fromEntries(API_RESOURCES.map((r) => [r, actionsFor(level)]));

/** Keeps known resources only; `write` always implies `read`. */
export function normalizePermissions(permissions: RawPermissions): ApiPermissions {
	let out: ApiPermissions = {};
	for (const r of API_RESOURCES) out = withLevel(out, r, levelOf(permissions, r));
	return out;
}

export function allows(permissions: RawPermissions, resource: string, action: ApiAction) {
	return !!permissions?.[resource]?.includes(action);
}

export function describePermissions(
	permissions: RawPermissions
): 'full' | 'read' | 'none' | 'custom' {
	const levels = API_RESOURCES.map((r) => levelOf(permissions, r));
	if (levels.every((l) => l === 'write')) return 'full';
	if (levels.every((l) => l === 'read')) return 'read';
	if (levels.every((l) => l === 'none')) return 'none';
	return 'custom';
}

export const apiPermissionsSchema = v.pipe(
	v.record(v.string(), v.array(v.picklist(API_ACTIONS))),
	v.transform((p: Record<string, ApiAction[]>) => normalizePermissions(p)),
	v.check((p) => Object.keys(p).length > 0, 'Grant at least one permission')
);
