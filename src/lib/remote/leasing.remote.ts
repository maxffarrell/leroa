import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/leasing.ts';
import {
	chargeInput,
	idSchema,
	leaseInput,
	leaseStatuses,
	leaseUpdate,
	monthSchema,
	paymentInput
} from '#lib/schemas.ts';

export const getLeases = query(v.optional(v.array(v.picklist(leaseStatuses))), async (status) =>
	svc.listLeases((await requireOrg()).orgId, status)
);
export const getLease = query(idSchema, async (id) => svc.getLease((await requireOrg()).orgId, id));
export const getRentRoll = query(monthSchema, async (month) =>
	svc.rentRoll((await requireOrg()).orgId, month)
);

export const createLease = command(leaseInput, async (input) => {
	const l = await svc.createLease(await requireOrg(), input);
	void getLeases().refresh();
	return l;
});
export const updateLease = command(leaseUpdate, async (input) => {
	const l = await svc.updateLease(await requireOrg(), input);
	void getLease(l.id).refresh();
	return l;
});
export const addCharge = command(chargeInput, async (input) => {
	const c = await svc.addCharge(await requireOrg(), input);
	void getLease(c.leaseId).refresh();
	void getRentRoll(c.dueDate.slice(0, 7)).refresh();
	return c;
});
export const recordPayment = command(
	v.object({ ...paymentInput.entries, month: v.optional(monthSchema) }),
	async ({ month, ...input }) => {
		const p = await svc.recordPayment(await requireOrg(), input);
		void getLease(p.leaseId).refresh();
		if (month) void getRentRoll(month).refresh();
		return p;
	}
);
export const deletePayment = command(
	v.object({ id: idSchema, leaseId: idSchema }),
	async ({ id, leaseId }) => {
		await svc.deletePayment(await requireOrg('admin'), id);
		void getLease(leaseId).refresh();
	}
);
