import { secureServices } from '#lib/server/access.ts';
import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg, requirePerm, assertScope } from '#lib/server/context.ts';
import * as svcRaw from '#lib/server/services/vendors.ts';
import { vendorsPolicy } from '#lib/server/access-policies.ts';
const svc = secureServices(svcRaw, vendorsPolicy);
import { idSchema, vendorInput, vendorUpdate } from '#lib/schemas.ts';

export const getVendors = query(v.optional(v.boolean(), false), async (includeArchived) =>
	svc.listVendors((await requireOrg()).orgId, { includeArchived })
);
export const getVendor = query(idSchema, async (id) =>
	svc.getVendor((await requireOrg()).orgId, id)
);
export const createVendor = command(vendorInput, async (input) => {
	const row = await svc.createVendor(
		await assertScope(await requirePerm('vendors', 'write'), input),
		input
	);
	void getVendors(false).refresh();
	return { id: row.id, name: row.name };
});
export const updateVendor = command(vendorUpdate, async (input) => {
	const ctx = await requireOrg(input.archived === undefined ? 'member' : 'admin');
	await svc.updateVendor(ctx, input);
	void getVendor(input.id).refresh();
	void getVendors(false).refresh();
	void getVendors(true).refresh();
});
