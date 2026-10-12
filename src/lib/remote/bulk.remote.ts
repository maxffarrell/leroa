import { secureServices } from '#lib/server/access.ts';
import { maintenancePolicy, vendorsPolicy, crmPolicy } from '#lib/server/access-policies.ts';
import * as v from 'valibot';
import { command } from '$app/server';
import { requireOrg, requirePerm } from '#lib/server/context.ts';
import { idSchema, ticketPriorities, ticketStatuses } from '#lib/schemas.ts';
import { LEAD_STAGES } from '#lib/leads.ts';
import * as ticketSvcRaw from '#lib/server/services/maintenance.ts';
const ticketSvc = secureServices(ticketSvcRaw, maintenancePolicy);
import * as vendorSvcRaw from '#lib/server/services/vendors.ts';
const vendorSvc = secureServices(vendorSvcRaw, vendorsPolicy);
import * as crmRaw from '#lib/server/services/crm.ts';
const crm = secureServices(crmRaw, crmPolicy);
import { getTickets } from './maintenance.remote.ts';
import { getVendors } from './vendors.remote.ts';
import { getLeads } from './crm.remote.ts';

export const bulkUpdateTickets = command(
	v.object({
		ids: v.array(idSchema),
		status: v.optional(v.picklist(ticketStatuses)),
		priority: v.optional(v.picklist(ticketPriorities)),
		vendorId: v.optional(v.nullable(idSchema))
	}),
	async ({ ids, ...data }) => {
		const ctx = await requirePerm('tickets', 'write');
		for (const id of ids) await ticketSvc.updateTicket(ctx, { id, ...data });
		void getTickets().refresh();
		return { count: ids.length };
	}
);

export const bulkSetVendorsArchived = command(
	v.object({ ids: v.array(idSchema), archived: v.boolean() }),
	async ({ ids, archived }) => {
		const ctx = await requireOrg('admin');
		for (const id of ids) await vendorSvc.updateVendor(ctx, { id, archived });
		void getVendors(false).refresh();
		void getVendors(true).refresh();
		return { count: ids.length };
	}
);

export const bulkSetLeadStage = command(
	v.object({ ids: v.array(idSchema), stage: v.picklist(LEAD_STAGES) }),
	async ({ ids, stage }) => {
		const ctx = await requirePerm('leads', 'write');
		for (const id of ids) await crm.updateLead(ctx, { id, stage });
		void getLeads().refresh();
		return { count: ids.length };
	}
);
