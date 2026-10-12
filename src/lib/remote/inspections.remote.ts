import { secureServices } from '#lib/server/access.ts';
import * as v from 'valibot';
import { inScope } from '#lib/remote/scope.ts';
import { command, query } from '$app/server';
import { requireOrg, requirePerm, assertScope, requireUser } from '#lib/server/context.ts';
import * as svcRaw from '#lib/server/services/inspections.ts';
import { inspectionsPolicy } from '#lib/server/access-policies.ts';
const svc = secureServices(svcRaw, inspectionsPolicy);
import {
	idSchema,
	inspectionAcknowledge,
	inspectionCreate,
	inspectionItemAdd,
	inspectionItemUpdate,
	inspectionUpdate
} from '#lib/schemas.ts';
import { getPortal } from './portal.remote.ts';

export const getInspections = query(
	v.optional(v.object({ leaseId: v.optional(idSchema) })),
	async (opts) => {
		const ctx = await requireOrg();
		return inScope(await svc.listInspections(ctx.orgId, opts ?? {}), ctx.propertyIds);
	}
);

export const getInspection = query(idSchema, async (id) =>
	svc.getInspection((await requireOrg()).orgId, id)
);

export const createInspection = command(inspectionCreate, async (input) => {
	const i = await svc.createInspection(
		await assertScope(await requirePerm('inspections', 'write'), input),
		input
	);
	void getInspections().refresh();
	return i;
});

export const updateInspection = command(inspectionUpdate, async (input) => {
	const i = await svc.updateInspection(
		await assertScope(await requirePerm('inspections', 'write'), input),
		input
	);
	void getInspection(i.id).refresh();
	return i;
});

export const deleteInspection = command(idSchema, async (id) => {
	await svc.deleteInspection(await requirePerm('inspections', 'write'), id);
	void getInspections().refresh();
});

export const addInspectionItem = command(inspectionItemAdd, async (input) => {
	const item = await svc.addItem(
		await assertScope(await requirePerm('inspections', 'write'), input),
		input
	);
	void getInspection(input.inspectionId).refresh();
	return item;
});

/** Ratings and notes update optimistically in the page, so the inspection is not refetched. */
export const updateInspectionItem = command(inspectionItemUpdate, async (input) =>
	svc.updateItem(await assertScope(await requirePerm('inspections', 'write'), input), input)
);

export const deleteInspectionItem = command(idSchema, async (id) => {
	const item = await svc.deleteItem(await requirePerm('inspections', 'write'), id);
	void getInspection(item.inspectionId).refresh();
});

export const completeInspection = command(
	v.object({
		id: idSchema,
		summary: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(5000))))
	}),
	async ({ id, summary }) => {
		const i = await svc.completeInspection(await requirePerm('inspections', 'write'), id, summary);
		void getInspection(id).refresh();
		void getInspections().refresh();
		return i;
	}
);

export const createRepairTicket = command(idSchema, async (itemId) =>
	svc.createRepairTicket(await requirePerm('inspections', 'write'), itemId)
);

export const acknowledgeInspection = command(inspectionAcknowledge, async (input) => {
	const r = await svc.acknowledgeInspection(requireUser().user.id, input);
	void getPortal().refresh();
	return r;
});
