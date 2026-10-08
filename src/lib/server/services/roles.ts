import { and, asc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { db } from '#lib/server/db/index.ts';
import { member, memberPropertyScope, orgRole } from '#lib/server/db/schema.ts';
import { normalizePermissions, type ApiPermissions } from '#lib/api-permissions.ts';
import { emit } from '#lib/server/services/events.ts';

export async function listRoles(orgId: string) {
	const roles = await db
		.select()
		.from(orgRole)
		.where(eq(orgRole.organizationId, orgId))
		.orderBy(asc(orgRole.name));
	const assigned = await db
		.select({ customRoleId: member.customRoleId })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const counts = new Map<string, number>();
	for (const m of assigned)
		if (m.customRoleId) counts.set(m.customRoleId, (counts.get(m.customRoleId) ?? 0) + 1);
	return roles.map((r) => ({
		...r,
		permissions: r.permissions as ApiPermissions,
		members: counts.get(r.id) ?? 0
	}));
}

export async function saveRole(
	orgId: string,
	actorId: string,
	input: { id?: string; name: string; permissions: ApiPermissions }
) {
	const permissions = normalizePermissions(input.permissions);
	if (input.id) {
		const [r] = await db
			.update(orgRole)
			.set({ name: input.name, permissions })
			.where(and(eq(orgRole.id, input.id), eq(orgRole.organizationId, orgId)))
			.returning();
		if (!r) error(404, 'Role not found');
		void emit({
			orgId,
			actorId,
			entityType: 'role',
			entityId: r.id,
			action: 'updated',
			summary: `Role ${r.name} updated`
		});
		return r;
	}
	const [r] = await db
		.insert(orgRole)
		.values({ id: `role_${randomUUID()}`, organizationId: orgId, name: input.name, permissions })
		.returning();
	void emit({
		orgId,
		actorId,
		entityType: 'role',
		entityId: r!.id,
		action: 'created',
		summary: `Role ${r!.name} created`
	});
	return r!;
}

export async function deleteRole(orgId: string, actorId: string, id: string) {
	const [r] = await db
		.delete(orgRole)
		.where(and(eq(orgRole.id, id), eq(orgRole.organizationId, orgId)))
		.returning();
	if (!r) error(404, 'Role not found');
	void emit({
		orgId,
		actorId,
		entityType: 'role',
		entityId: id,
		action: 'deleted',
		summary: `Role ${r.name} deleted`
	});
}

/** Assign (or clear) a member's custom role. Custom roles only restrict role='member' users. */
export async function assignRole(
	orgId: string,
	actorId: string,
	memberId: string,
	customRoleId: string | null
) {
	const [m] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
	if (!m) error(404, 'Member not found');
	if (customRoleId) {
		const [r] = await db
			.select({ id: orgRole.id })
			.from(orgRole)
			.where(and(eq(orgRole.id, customRoleId), eq(orgRole.organizationId, orgId)));
		if (!r) error(404, 'Role not found');
	}
	await db.update(member).set({ customRoleId }).where(eq(member.id, memberId));
	void emit({
		orgId,
		actorId,
		entityType: 'member',
		entityId: memberId,
		action: 'role_assigned',
		summary: 'Member role updated',
		data: { customRoleId }
	});
}

/** Replace a member's property scope. Empty = all properties. */
export async function setPropertyScope(
	orgId: string,
	actorId: string,
	memberId: string,
	propertyIds: string[]
) {
	const [m] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.id, memberId), eq(member.organizationId, orgId)));
	if (!m) error(404, 'Member not found');
	await db.delete(memberPropertyScope).where(eq(memberPropertyScope.memberId, memberId));
	if (propertyIds.length)
		await db
			.insert(memberPropertyScope)
			.values(propertyIds.map((propertyId) => ({ memberId, propertyId })));
	void emit({
		orgId,
		actorId,
		entityType: 'member',
		entityId: memberId,
		action: 'scope_updated',
		summary: 'Member property scope updated',
		data: { propertyIds }
	});
}

export async function memberAccess(orgId: string) {
	const members = await db
		.select({ id: member.id, customRoleId: member.customRoleId })
		.from(member)
		.where(eq(member.organizationId, orgId));
	const ids = members.map((m) => m.id);
	const scopes = ids.length
		? await db.select().from(memberPropertyScope).where(inArray(memberPropertyScope.memberId, ids))
		: [];
	const byMember = new Map<string, string[]>();
	for (const s of scopes) {
		const list = byMember.get(s.memberId) ?? [];
		list.push(s.propertyId);
		byMember.set(s.memberId, list);
	}
	return members.map((m) => ({
		memberId: m.id,
		customRoleId: m.customRoleId,
		propertyIds: byMember.get(m.id) ?? []
	}));
}
