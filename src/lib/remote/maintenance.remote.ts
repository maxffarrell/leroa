import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/maintenance.ts';
import { ticketInput, ticketUpdate } from '#lib/schemas.ts';

export const getTickets = query(async () => svc.listTickets((await requireOrg()).orgId));
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
