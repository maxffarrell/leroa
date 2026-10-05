import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg, requireUser } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/inspections.ts';
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
	async (opts) => svc.listInspections((await requireOrg()).orgId, opts ?? {})
);

export const getInspection = query(idSchema, async (id) =>
	svc.getInspection((await requireOrg()).orgId, id)
);

export const createInspection = command(inspectionCreate, async (input) => {
	const i = await svc.createInspection(await requireOrg(), input);
	void getInspections().refresh();
	return i;
});

export const updateInspection = command(inspectionUpdate, async (input) => {
	const i = await svc.updateInspection(await requireOrg(), input);
	void getInspection(i.id).refresh();
	return i;
});

export const deleteInspection = command(idSchema, async (id) => {
	await svc.deleteInspection(await requireOrg(), id);
	void getInspections().refresh();
});

export const addInspectionItem = command(inspectionItemAdd, async (input) => {
	const item = await svc.addItem(await requireOrg(), input);
	void getInspection(input.inspectionId).refresh();
	return item;
});

/** Ratings and notes update optimistically in the page, so the inspection is not refetched. */
export const updateInspectionItem = command(inspectionItemUpdate, async (input) =>
	svc.updateItem(await requireOrg(), input)
);

export const deleteInspectionItem = command(idSchema, async (id) => {
	const item = await svc.deleteItem(await requireOrg(), id);
	void getInspection(item.inspectionId).refresh();
});

export const completeInspection = command(
	v.object({
		id: idSchema,
		summary: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(5000))))
	}),
	async ({ id, summary }) => {
		const i = await svc.completeInspection(await requireOrg(), id, summary);
		void getInspection(id).refresh();
		void getInspections().refresh();
		return i;
	}
);

export const createRepairTicket = command(idSchema, async (itemId) =>
	svc.createRepairTicket(await requireOrg(), itemId)
);

export const acknowledgeInspection = command(inspectionAcknowledge, async (input) => {
	const r = await svc.acknowledgeInspection(requireUser().user.id, input);
	void getPortal().refresh();
	return r;
});
