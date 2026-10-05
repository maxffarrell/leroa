import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/maintenance.ts';
import { idSchema, ticketInput, ticketNoteInput, ticketUpdate } from '#lib/schemas.ts';

export const getTickets = query(async () => svc.listTickets((await requireOrg()).orgId));
export const getTicketActivity = query(idSchema, async (id) =>
	svc.ticketActivity((await requireOrg()).orgId, id)
);
export const createTicket = command(ticketInput, async (input) => {
	const t = await svc.createTicket(await requireOrg(), input);
	void getTickets().refresh();
	return t;
});
export const updateTicket = command(ticketUpdate, async (input) => {
	const t = await svc.updateTicket(await requireOrg(), input);
	void getTickets().refresh();
	return t;
});
export const addTicketNote = command(ticketNoteInput, async (input) => {
	await svc.addTicketNote(await requireOrg(), input);
	void getTicketActivity(input.ticketId).refresh();
	void getTickets().refresh();
});
export const sendWorkOrder = command(idSchema, async (id) => {
	await svc.sendWorkOrder(await requireOrg(), id);
	void getTickets().refresh();
});
export const getWorkOrderLink = command(idSchema, async (id) => ({
	path: await svc.workOrderPath((await requireOrg()).orgId, id)
}));
