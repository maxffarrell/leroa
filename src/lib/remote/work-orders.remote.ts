import * as v from 'valibot';
import { command, query } from '$app/server';
import * as svc from '#lib/server/services/work-orders.ts';
import { workOrderUpdate } from '#lib/schemas.ts';

/** Public: the signed token in the vendor's link is the only credential. */
export const getWorkOrder = query(v.string(), (token) => svc.getWorkOrder(token));
export const updateWorkOrder = command(workOrderUpdate, async (input) => {
	await svc.updateWorkOrder(input);
	void getWorkOrder(input.token).refresh();
});
