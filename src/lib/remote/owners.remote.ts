import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { requireOrg, requirePerm, assertScope, requireUser } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/owners.ts';
import { idSchema, ownerInput, ownerUpdate } from '#lib/schemas.ts';

export const getOwners = query(v.optional(v.boolean(), false), async (includeArchived) =>
	svc.listOwners((await requireOrg()).orgId, { includeArchived })
);
export const getOwner = query(idSchema, async (id) => svc.getOwner((await requireOrg()).orgId, id));
export const getOwnerReport = query(idSchema, async (id) => {
	const { orgId } = await requireOrg();
	await svc.getOwner(orgId, id);
	return svc.ownerReport(orgId, id);
});
export const getPropertyOwners = query(idSchema, async (propertyId) =>
	svc.propertyOwners((await requireOrg()).orgId, propertyId)
);

export const createOwner = command(ownerInput, async (input) => {
	const row = await svc.createOwner(
		await assertScope(await requirePerm('owners', 'write'), input),
		input
	);
	void getOwners(false).refresh();
	return { id: row.id, name: row.name };
});
export const updateOwner = command(ownerUpdate, async (input) => {
	const ctx = await requireOrg(input.archived === undefined ? 'member' : 'admin');
	await svc.updateOwner(ctx, input);
	void getOwner(input.id).refresh();
	void getOwnerReport(input.id).refresh();
	void getOwners(false).refresh();
	void getOwners(true).refresh();
});

/** Staff action: a 14-day link that connects the signed-in user to this owner record. */
export const createOwnerLink = command(idSchema, async (id) => {
	const { orgId } = await requirePerm('owners', 'write');
	const o = await svc.getOwner(orgId, id);
	if (o.archivedAt) error(409, 'Restore this owner before inviting them');
	return { path: `/owner/claim/${svc.ownerToken(o.id)}` };
});

export const getOwnerPortal = query(async () => svc.ownerPortal(requireUser().user.id));
