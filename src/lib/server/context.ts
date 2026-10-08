import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	lease,
	member,
	memberPropertyScope,
	organization,
	orgRole,
	unit
} from '#lib/server/db/schema.ts';
import {
	allows,
	type ApiAction,
	type ApiPermissions,
	type ApiResource
} from '#lib/api-permissions.ts';

export type Role = 'owner' | 'admin' | 'member';

export type OrgContext = {
	userId: string;
	orgId: string;
	role: Role;
	memberId: string;
	/** Permission matrix from the member's custom role; null = unrestricted (owner/admin, or member with no role). */
	perms: ApiPermissions | null;
	/** Property ids the member is scoped to; null = all properties. */
	propertyIds: string[] | null;
	org: {
		id: string;
		name: string;
		slug: string;
		logo: string | null;
		accentColor: string | null;
		portalTitle: string | null;
	};
};

const cache = new WeakMap<object, Promise<OrgContext | null>>();

export function requireUser() {
	const { locals } = getRequestEvent();
	if (!locals.user || !locals.session) error(401, 'Not signed in');
	return { user: locals.user, session: locals.session };
}

async function resolveOrg(): Promise<OrgContext | null> {
	const { locals } = getRequestEvent();
	if (!locals.user || !locals.session) return null;
	const userId = locals.user.id;
	const activeId = locals.session.activeOrganizationId;

	const rows = await db
		.select({
			memberId: member.id,
			role: member.role,
			customRoleId: member.customRoleId,
			org: {
				id: organization.id,
				name: organization.name,
				slug: organization.slug,
				logo: organization.logo,
				accentColor: organization.accentColor,
				portalTitle: organization.portalTitle
			}
		})
		.from(member)
		.innerJoin(organization, eq(member.organizationId, organization.id))
		.where(
			activeId
				? and(eq(member.userId, userId), eq(member.organizationId, activeId))
				: eq(member.userId, userId)
		)
		.orderBy(asc(member.createdAt))
		.limit(1);

	const row = rows[0];
	if (!row) return null;

	let perms: ApiPermissions | null = null;
	if (row.customRoleId && row.role === 'member') {
		const [r] = await db
			.select({ permissions: orgRole.permissions })
			.from(orgRole)
			.where(and(eq(orgRole.id, row.customRoleId), eq(orgRole.organizationId, row.org.id)));
		perms = (r?.permissions as ApiPermissions | undefined) ?? {};
	}

	const scoped = await db
		.select({ propertyId: memberPropertyScope.propertyId })
		.from(memberPropertyScope)
		.where(eq(memberPropertyScope.memberId, row.memberId));
	const propertyIds = scoped.length ? scoped.map((s) => s.propertyId) : null;

	return {
		userId,
		orgId: row.org.id,
		role: row.role as Role,
		memberId: row.memberId,
		perms,
		propertyIds,
		org: row.org
	};
}

/** Membership for the active organization, memoised per request. */
export function getOrg(): Promise<OrgContext | null> {
	const event = getRequestEvent();
	let pending = cache.get(event.locals);
	if (!pending) {
		pending = resolveOrg();
		cache.set(event.locals, pending);
	}
	return pending;
}

export async function requireOrg(minRole: Role = 'member'): Promise<OrgContext> {
	requireUser();
	const ctx = await getOrg();
	if (!ctx) error(403, 'No workspace');
	if (minRole !== 'member' && rank(ctx.role) < rank(minRole))
		error(403, 'Insufficient permissions');
	return ctx;
}

/** Owner/admin and unscoped members pass; a member with a custom role must grant `action` on `resource`. */
export async function requirePerm(
	resource: ApiResource,
	action: ApiAction = 'read',
	minRole: Role = 'member'
): Promise<OrgContext> {
	const ctx = await requireOrg(minRole);
	if (ctx.perms && !allows(ctx.perms, resource, action)) error(403, 'Insufficient permissions');
	return ctx;
}

/** 404 when the member's property scope excludes this property (mirrors missing-record semantics). */
export function assertProperty(ctx: OrgContext, propertyId: string | null | undefined) {
	if (ctx.propertyIds && propertyId && !ctx.propertyIds.includes(propertyId))
		error(404, 'Not found');
}

/** Drizzle condition restricting a property-id column to the member's scope, or undefined. */
export function scopedTo(ctx: OrgContext, column: Parameters<typeof inArray>[0]): SQL | undefined {
	return ctx.propertyIds ? inArray(column, ctx.propertyIds) : undefined;
}

function rank(role: Role) {
	return role === 'owner' ? 2 : role === 'admin' ? 1 : 0;
}

/** Resolves the property behind a {propertyId | unitId | leaseId} input and 404s when out of scope. */
export async function assertScope(ctx: OrgContext, input: object): Promise<OrgContext> {
	if (!ctx.propertyIds) return ctx;
	const {
		propertyId: pid,
		unitId,
		leaseId
	} = input as {
		propertyId?: string | null;
		unitId?: string | null;
		leaseId?: string | null;
	};
	let propertyId = pid ?? null;
	if (!propertyId && unitId) {
		const [u] = await db
			.select({ propertyId: unit.propertyId })
			.from(unit)
			.where(eq(unit.id, unitId));
		propertyId = u?.propertyId ?? null;
	}
	if (!propertyId && leaseId) {
		const [l] = await db
			.select({ propertyId: unit.propertyId })
			.from(lease)
			.innerJoin(unit, eq(lease.unitId, unit.id))
			.where(eq(lease.id, leaseId));
		propertyId = l?.propertyId ?? null;
	}
	assertProperty(ctx, propertyId);
	return ctx;
}
