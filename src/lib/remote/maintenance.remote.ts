import { secureServices } from '#lib/server/access.ts';
import { inScope } from '#lib/remote/scope.ts';
import { command, query } from '$app/server';
import { requireOrg, requirePerm, assertScope } from '#lib/server/context.ts';
import * as svcRaw from '#lib/server/services/maintenance.ts';
import { maintenancePolicy } from '#lib/server/access-policies.ts';
const svc = secureServices(svcRaw, maintenancePolicy);
import { idSchema, ticketInput, ticketNoteInput, ticketUpdate } from '#lib/schemas.ts';

export const getTickets = query(async () => {
	const ctx = await requireOrg();
	return inScope(await svc.listTickets(ctx.orgId), ctx.propertyIds);
});
export const getTicketActivity = query(idSchema, async (id) =>
	svc.ticketActivity((await requireOrg()).orgId, id)
);
export const createTicket = command(ticketInput, async (input) => {
	const t = await svc.createTicket(
		await assertScope(await requirePerm('tickets', 'write'), input),
		input
	);
	void getTickets().refresh();
	return t;
});
export const updateTicket = command(ticketUpdate, async (input) => {
	const t = await svc.updateTicket(
		await assertScope(await requirePerm('tickets', 'write'), input),
		input
	);
	void getTickets().refresh();
	return t;
});
export const addTicketNote = command(ticketNoteInput, async (input) => {
	await svc.addTicketNote(await assertScope(await requirePerm('tickets', 'write'), input), input);
	void getTicketActivity(input.ticketId).refresh();
	void getTickets().refresh();
});
export const sendWorkOrder = command(idSchema, async (id) => {
	await svc.sendWorkOrder(await requirePerm('tickets', 'write'), id);
	void getTickets().refresh();
});
export const getWorkOrderLink = command(idSchema, async (id) => ({
	path: await svc.workOrderPath((await requirePerm('tickets', 'write')).orgId, id)
}));
