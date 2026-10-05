import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import type { OrgContext } from '#lib/server/context.ts';
import * as portfolio from '#lib/server/services/portfolio.ts';
import * as leasing from '#lib/server/services/leasing.ts';
import * as maintenance from '#lib/server/services/maintenance.ts';
import * as listings from '#lib/server/services/listings.ts';
import * as vendors from '#lib/server/services/vendors.ts';
import * as inspections from '#lib/server/services/inspections.ts';
import * as messaging from '#lib/server/services/messaging.ts';
import * as owners from '#lib/server/services/owners.ts';
import * as s from '#lib/schemas.ts';

type Resource = {
	description: string;
	list: (ctx: OrgContext, url: URL) => Promise<unknown>;
	get?: (ctx: OrgContext, id: string) => Promise<unknown>;
	create?: { schema: v.GenericSchema; run: (ctx: OrgContext, input: never) => Promise<unknown> };
	update?: { schema: v.GenericSchema; run: (ctx: OrgContext, input: never) => Promise<unknown> };
};

/** Public REST surface, mirrored by the OpenAPI document. Mutations go through the same services as the UI. */
export const resources: Record<string, Resource> = {
	properties: {
		description: 'Buildings and their units',
		list: (ctx) => portfolio.listProperties(ctx.orgId),
		get: (ctx, id) => portfolio.getProperty(ctx.orgId, id),
		create: { schema: s.propertyCreate, run: portfolio.createProperty as never },
		update: { schema: s.propertyUpdate, run: portfolio.updateProperty as never }
	},
	units: {
		description: 'Rentable units',
		list: (ctx, url) =>
			portfolio.listUnits(ctx.orgId, { vacantOnly: url.searchParams.get('vacant') === 'true' }),
		create: { schema: s.unitInput, run: portfolio.createUnit as never },
		update: { schema: s.unitUpdate, run: portfolio.updateUnit as never }
	},
	tenants: {
		description: 'People and companies renting units',
		list: (ctx, url) => portfolio.listTenants(ctx.orgId, url.searchParams.get('q') ?? undefined),
		get: (ctx, id) => portfolio.getTenant(ctx.orgId, id),
		create: { schema: s.tenantInput, run: portfolio.createTenant as never },
		update: { schema: s.tenantUpdate, run: portfolio.updateTenant as never }
	},
	leases: {
		description: 'Leases with balances',
		list: (ctx, url) => {
			const status = url.searchParams
				.getAll('status')
				.filter((x): x is (typeof s.leaseStatuses)[number] =>
					(s.leaseStatuses as readonly string[]).includes(x)
				);
			return leasing.listLeases(ctx.orgId, status);
		},
		get: (ctx, id) => leasing.getLease(ctx.orgId, id),
		create: { schema: s.leaseInput, run: leasing.createLease as never },
		update: { schema: s.leaseUpdate, run: leasing.updateLease as never }
	},
	charges: {
		description: 'Charges due in a month (`?month=YYYY-MM`)',
		list: (ctx, url) => {
			const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
			if (!/^\d{4}-\d{2}$/.test(month)) error(400, 'month must be YYYY-MM');
			return leasing.rentRoll(ctx.orgId, month);
		},
		create: { schema: s.chargeInput, run: leasing.addCharge as never }
	},
	payments: {
		description: 'Record received payments',
		list: async () => error(405, 'List payments via GET /leases/{id}'),
		create: { schema: s.paymentInput, run: leasing.recordPayment as never }
	},
	tickets: {
		description: 'Maintenance requests',
		list: (ctx, url) =>
			maintenance.listTickets(ctx.orgId, {
				propertyId: url.searchParams.get('propertyId') ?? undefined,
				vendorId: url.searchParams.get('vendorId') ?? undefined
			}),
		create: { schema: s.ticketInput, run: maintenance.createTicket as never },
		update: { schema: s.ticketUpdate, run: maintenance.updateTicket as never }
	},
	vendors: {
		description: 'Contractors and service companies (`?archived=true` to include archived)',
		list: (ctx, url) =>
			vendors.listVendors(ctx.orgId, {
				includeArchived: url.searchParams.get('archived') === 'true'
			}),
		get: (ctx, id) => vendors.getVendor(ctx.orgId, id),
		create: { schema: s.vendorInput, run: vendors.createVendor as never },
		update: { schema: s.vendorUpdate, run: vendors.updateVendor as never }
	},
	inspections: {
		description: 'Move-in, move-out and routine unit inspections (`?leaseId=` to filter)',
		list: (ctx, url) =>
			inspections.listInspections(ctx.orgId, {
				leaseId: url.searchParams.get('leaseId') ?? undefined
			}),
		get: (ctx, id) => inspections.getInspection(ctx.orgId, id)
	},
	messages: {
		description:
			'Tenant conversations. List returns threads; get takes a tenant ID and returns its messages. Create sends a message as the key owner.',
		list: (ctx) => messaging.listThreads(ctx.orgId),
		get: (ctx, tenantId) => messaging.getThread(ctx.orgId, tenantId),
		create: { schema: s.messageSend, run: messaging.sendStaffMessage as never }
	},
	announcements: {
		description: 'Notices posted to residents of one property (`propertyId`) or all of them',
		list: (ctx) => messaging.listAnnouncements(ctx.orgId),
		create: { schema: s.announcementCreate, run: messaging.createAnnouncement as never }
	},
	owners: {
		description:
			'Property owners and the properties they own (`propertyIds`). `?archived=true` includes archived owners.',
		list: (ctx, url) =>
			owners.listOwners(ctx.orgId, {
				includeArchived: url.searchParams.get('archived') === 'true'
			}),
		get: (ctx, id) => owners.getOwner(ctx.orgId, id),
		create: { schema: s.ownerInput, run: owners.createOwner as never },
		update: { schema: s.ownerUpdate, run: owners.updateOwner as never }
	},
	listings: {
		description: 'Vacancy listings, published or not',
		list: (ctx) => listings.listListings(ctx.orgId),
		get: (ctx, id) => listings.getListing(ctx.orgId, id),
		update: { schema: s.listingUpdate, run: listings.updateListing as never }
	},
	applications: {
		description: 'Rental applications submitted from public listings',
		list: (ctx) => listings.listApplications(ctx.orgId),
		get: (ctx, id) => listings.getApplication(ctx.orgId, id),
		update: { schema: s.applicationUpdate, run: listings.updateApplication as never }
	}
};

export function resource(name: string) {
	const r = resources[name];
	if (!r) error(404, `Unknown resource "${name}"`);
	return r;
}

export async function parseBody<T extends v.GenericSchema>(
	schema: T,
	request: Request,
	extra: Record<string, unknown> = {}
) {
	const body = await request.json().catch(() => error(400, 'Body must be JSON'));
	const result = v.safeParse(schema, { ...body, ...extra });
	if (!result.success) {
		error(422, result.issues.map((i) => `${v.getDotPath(i) ?? 'body'}: ${i.message}`).join('; '));
	}
	return result.output as v.InferOutput<T>;
}
