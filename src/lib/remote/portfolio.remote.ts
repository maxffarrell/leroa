import * as v from 'valibot';
import { inScope } from '#lib/remote/scope.ts';
import { command, query } from '$app/server';
import { requireOrg, requirePerm, assertScope } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/portfolio.ts';
import {
	idSchema,
	propertyCreate,
	propertyUpdate,
	tenantInput,
	tenantUpdate,
	unitInput,
	unitUpdate
} from '#lib/schemas.ts';

export const getProperties = query(async () => {
	const ctx = await requireOrg();
	return inScope(await svc.listProperties(ctx.orgId), ctx.propertyIds, 'id');
});
export const getProperty = query(idSchema, async (id) =>
	svc.getProperty((await requireOrg()).orgId, id)
);
export const getUnits = query(
	v.optional(v.object({ vacantOnly: v.optional(v.boolean()) })),
	async (opts) => {
		const ctx = await requireOrg();
		return inScope(await svc.listUnits(ctx.orgId, opts ?? {}), ctx.propertyIds);
	}
);

export const createProperty = command(propertyCreate, async (input) => {
	const p = await svc.createProperty(
		await assertScope(await requirePerm('properties', 'write'), input),
		input
	);
	void getProperties().refresh();
	return p;
});
export const updateProperty = command(propertyUpdate, async (input) => {
	const p = await svc.updateProperty(
		await assertScope(await requirePerm('properties', 'write'), input),
		input
	);
	void getProperty(p.id).refresh();
	void getProperties().refresh();
	return p;
});
export const archiveProperty = command(idSchema, async (id) => {
	await svc.archiveProperty(await requireOrg('admin'), id);
	void getProperties().refresh();
});

export const createUnit = command(unitInput, async (input) => {
	const u = await svc.createUnit(
		await assertScope(await requirePerm('units', 'write'), input),
		input
	);
	void getProperty(u.propertyId).refresh();
	return u;
});
export const updateUnit = command(unitUpdate, async (input) => {
	const u = await svc.updateUnit(
		await assertScope(await requirePerm('units', 'write'), input),
		input
	);
	void getProperty(u.propertyId).refresh();
	return u;
});
export const deleteUnit = command(
	v.object({ id: idSchema, propertyId: idSchema }),
	async ({ id, propertyId }) => {
		await svc.deleteUnit(await requireOrg('admin'), id);
		void getProperty(propertyId).refresh();
	}
);

export const getTenants = query(async () => svc.listTenants((await requireOrg()).orgId));
export const getTenant = query(idSchema, async (id) =>
	svc.getTenant((await requireOrg()).orgId, id)
);
export const createTenant = command(tenantInput, async (input) => {
	const t = await svc.createTenant(
		await assertScope(await requirePerm('tenants', 'write'), input),
		input
	);
	void getTenants().refresh();
	return t;
});
export const updateTenant = command(tenantUpdate, async (input) => {
	const t = await svc.updateTenant(
		await assertScope(await requirePerm('tenants', 'write'), input),
		input
	);
	void getTenant(t.id).refresh();
	void getTenants().refresh();
	return t;
});
export const deleteTenant = command(idSchema, async (id) => {
	await svc.deleteTenant(await requireOrg('admin'), id);
	void getTenants().refresh();
});
