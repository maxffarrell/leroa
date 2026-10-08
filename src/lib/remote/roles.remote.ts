import * as v from 'valibot';
import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { requireOrg } from '#lib/server/context.ts';
import { hasFeature } from '#lib/server/ee/license.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import { apiPermissionsSchema } from '#lib/api-permissions.ts';
import { idSchema } from '#lib/schemas.ts';
import * as svc from '#lib/server/services/roles.ts';

function requireEnterprise() {
	if (!hasFeature('custom_roles')) error(403, 'Custom roles require an enterprise license');
}

export const getRoles = query(async () => {
	const { orgId } = await requireOrg('admin');
	requireEnterprise();
	return svc.listRoles(orgId);
});

export const saveRole = command(
	v.object({
		id: v.optional(idSchema),
		name: v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(64)),
		permissions: apiPermissionsSchema
	}),
	async (input) => {
		assertNotDemo();
		requireEnterprise();
		const { orgId, userId } = await requireOrg('admin');
		const r = await svc.saveRole(orgId, userId, input);
		void getRoles().refresh();
		return r;
	}
);

export const deleteRole = command(idSchema, async (id) => {
	assertNotDemo();
	requireEnterprise();
	const { orgId, userId } = await requireOrg('admin');
	await svc.deleteRole(orgId, userId, id);
	void getRoles().refresh();
});

/** Per-member access for the team settings page: assigned role + property scope. */
export const getMemberAccess = query(async () => {
	const { orgId } = await requireOrg('admin');
	return svc.memberAccess(orgId);
});

export const assignMemberRole = command(
	v.object({ memberId: idSchema, customRoleId: v.nullable(idSchema) }),
	async ({ memberId, customRoleId }) => {
		assertNotDemo();
		requireEnterprise();
		const { orgId, userId } = await requireOrg('admin');
		await svc.assignRole(orgId, userId, memberId, customRoleId);
		void getMemberAccess().refresh();
	}
);

export const setMemberScope = command(
	v.object({ memberId: idSchema, propertyIds: v.array(idSchema) }),
	async ({ memberId, propertyIds }) => {
		assertNotDemo();
		const { orgId, userId } = await requireOrg('admin');
		await svc.setPropertyScope(orgId, userId, memberId, propertyIds);
		void getMemberAccess().refresh();
	}
);
