import { secureServices } from '#lib/server/access.ts';
import {
	portfolioPolicy,
	leasingPolicy,
	maintenancePolicy,
	vendorsPolicy,
	assetsPolicy,
	schedulesPolicy,
	turnsPolicy,
	inspectionsPolicy,
	messagingPolicy,
	ownersPolicy,
	listingsPolicy,
	crmPolicy
} from '#lib/server/access-policies.ts';
import * as v from 'valibot';
import { error } from '@sveltejs/kit';
import type { OrgContext } from '#lib/server/context.ts';
import * as portfolio from '#lib/server/services/portfolio.ts';
import * as leasing from '#lib/server/services/leasing.ts';
import * as maintenance from '#lib/server/services/maintenance.ts';
import * as listings from '#lib/server/services/listings.ts';
import * as vendors from '#lib/server/services/vendors.ts';
import * as assets from '#lib/server/services/assets.ts';
import * as schedules from '#lib/server/services/schedules.ts';
import * as turns from '#lib/server/services/turns.ts';
import * as inspections from '#lib/server/services/inspections.ts';
import * as messaging from '#lib/server/services/messaging.ts';
import * as owners from '#lib/server/services/owners.ts';
import * as reports from '#lib/server/services/reports.ts';
import * as crm from '#lib/server/services/crm.ts';
import { REPORT_KEYS, REPORTS, type ReportKey } from '#lib/reports.ts';
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
		list: (ctx) => secureServices(portfolio, portfolioPolicy, ctx).listProperties(ctx.orgId),
		get: (ctx, id) => secureServices(portfolio, portfolioPolicy, ctx).getProperty(ctx.orgId, id),
		create: { schema: s.propertyCreate, run: portfolio.createProperty as never },
		update: { schema: s.propertyUpdate, run: portfolio.updateProperty as never }
	},
	units: {
		description: 'Rentable units',
		list: (ctx, url) =>
			secureServices(portfolio, portfolioPolicy, ctx).listUnits(ctx.orgId, {
				vacantOnly: url.searchParams.get('vacant') === 'true'
			}),
		create: { schema: s.unitInput, run: portfolio.createUnit as never },
		update: { schema: s.unitUpdate, run: portfolio.updateUnit as never }
	},
	tenants: {
		description: 'People and companies renting units',
		list: (ctx, url) =>
			secureServices(portfolio, portfolioPolicy, ctx).listTenants(
				ctx.orgId,
				url.searchParams.get('q') ?? undefined
			),
		get: (ctx, id) => secureServices(portfolio, portfolioPolicy, ctx).getTenant(ctx.orgId, id),
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
			return secureServices(leasing, leasingPolicy, ctx).listLeases(ctx.orgId, status);
		},
		get: (ctx, id) => secureServices(leasing, leasingPolicy, ctx).getLease(ctx.orgId, id),
		create: { schema: s.leaseInput, run: leasing.createLease as never },
		update: { schema: s.leaseUpdate, run: leasing.updateLease as never }
	},
	charges: {
		description: 'Charges due in a month (`?month=YYYY-MM`)',
		list: (ctx, url) => {
			const month = url.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
			if (!/^\d{4}-\d{2}$/.test(month)) error(400, 'month must be YYYY-MM');
			return secureServices(leasing, leasingPolicy, ctx).rentRoll(ctx.orgId, month);
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
			secureServices(maintenance, maintenancePolicy, ctx).listTickets(ctx.orgId, {
				propertyId: url.searchParams.get('propertyId') ?? undefined,
				vendorId: url.searchParams.get('vendorId') ?? undefined
			}),
		create: { schema: s.ticketInput, run: maintenance.createTicket as never },
		update: { schema: s.ticketUpdate, run: maintenance.updateTicket as never }
	},
	vendors: {
		description: 'Contractors and service companies (`?archived=true` to include archived)',
		list: (ctx, url) =>
			secureServices(vendors, vendorsPolicy, ctx).listVendors(ctx.orgId, {
				includeArchived: url.searchParams.get('archived') === 'true'
			}),
		get: (ctx, id) => secureServices(vendors, vendorsPolicy, ctx).getVendor(ctx.orgId, id),
		create: { schema: s.vendorInput, run: vendors.createVendor as never },
		update: { schema: s.vendorUpdate, run: vendors.updateVendor as never }
	},
	assets: {
		description:
			'Equipment records with warranty and service history (`?archived=true` to include archived)',
		list: (ctx, url) =>
			secureServices(assets, assetsPolicy, ctx).listAssets(ctx.orgId, {
				propertyId: url.searchParams.get('propertyId') ?? undefined,
				includeArchived: url.searchParams.get('archived') === 'true'
			}),
		get: (ctx, id) => secureServices(assets, assetsPolicy, ctx).getAsset(ctx.orgId, id),
		create: { schema: s.assetInput, run: assets.createAsset as never },
		update: { schema: s.assetUpdate, run: assets.updateAsset as never }
	},
	schedules: {
		description: 'Preventive-maintenance schedules that issue work orders when a run comes due',
		list: (ctx, url) =>
			secureServices(schedules, schedulesPolicy, ctx).listSchedules(ctx.orgId, {
				propertyId: url.searchParams.get('propertyId') ?? undefined
			}),
		create: { schema: s.scheduleInput, run: schedules.createSchedule as never },
		update: { schema: s.scheduleUpdate, run: schedules.updateSchedule as never }
	},
	turns: {
		description:
			"Unit turns — a unit's trip from move-out to re-leased. `?done=true` includes completed turns.",
		list: (ctx, url) =>
			secureServices(turns, turnsPolicy, ctx).listTurns(ctx.orgId, {
				includeDone: url.searchParams.get('done') === 'true'
			}),
		create: { schema: s.turnInput, run: turns.startTurn as never },
		update: { schema: s.turnUpdate, run: turns.updateTurn as never }
	},
	inspections: {
		description: 'Move-in, move-out and routine unit inspections (`?leaseId=` to filter)',
		list: (ctx, url) =>
			secureServices(inspections, inspectionsPolicy, ctx).listInspections(ctx.orgId, {
				leaseId: url.searchParams.get('leaseId') ?? undefined
			}),
		get: (ctx, id) =>
			secureServices(inspections, inspectionsPolicy, ctx).getInspection(ctx.orgId, id)
	},
	messages: {
		description:
			'Tenant conversations. List returns threads; get takes a tenant ID and returns its messages. Create sends a message as the key owner.',
		list: (ctx) => secureServices(messaging, messagingPolicy, ctx).listThreads(ctx.orgId),
		get: (ctx, tenantId) =>
			secureServices(messaging, messagingPolicy, ctx).getThread(ctx.orgId, tenantId),
		create: { schema: s.messageSend, run: messaging.sendStaffMessage as never }
	},
	announcements: {
		description: 'Notices posted to residents of one property (`propertyId`) or all of them',
		list: (ctx) => secureServices(messaging, messagingPolicy, ctx).listAnnouncements(ctx.orgId),
		create: { schema: s.announcementCreate, run: messaging.createAnnouncement as never }
	},
	owners: {
		description:
			'Property owners and the properties they own (`propertyIds`). `?archived=true` includes archived owners.',
		list: (ctx, url) =>
			secureServices(owners, ownersPolicy, ctx).listOwners(ctx.orgId, {
				includeArchived: url.searchParams.get('archived') === 'true'
			}),
		get: (ctx, id) => secureServices(owners, ownersPolicy, ctx).getOwner(ctx.orgId, id),
		create: { schema: s.ownerInput, run: owners.createOwner as never },
		update: { schema: s.ownerUpdate, run: owners.updateOwner as never }
	},
	listings: {
		description: 'Vacancy listings, published or not',
		list: (ctx) => secureServices(listings, listingsPolicy, ctx).listListings(ctx.orgId),
		get: (ctx, id) => secureServices(listings, listingsPolicy, ctx).getListing(ctx.orgId, id),
		update: { schema: s.listingUpdate, run: listings.updateListing as never }
	},
	applications: {
		description: 'Rental applications submitted from public listings',
		list: (ctx) => secureServices(listings, listingsPolicy, ctx).listApplications(ctx.orgId),
		get: (ctx, id) => secureServices(listings, listingsPolicy, ctx).getApplication(ctx.orgId, id),
		update: { schema: s.applicationUpdate, run: listings.updateApplication as never }
	},
	leads: {
		description:
			'Prospective residents in the leasing pipeline. Creating a lead with the email of an open lead updates that lead',
		list: (ctx) => secureServices(crm, crmPolicy, ctx).listLeads(ctx.orgId),
		get: (ctx, id) => secureServices(crm, crmPolicy, ctx).getLead(ctx.orgId, id),
		create: { schema: s.leadApiInput, run: crm.createLead as never },
		update: { schema: s.leadUpdate, run: crm.updateLead as never }
	},
	tours: {
		description: 'Property tours with leads, from 30 days ago onward',
		list: (ctx) => secureServices(crm, crmPolicy, ctx).listTours(ctx.orgId),
		get: (ctx, id) => secureServices(crm, crmPolicy, ctx).getTour(ctx.orgId, id),
		create: { schema: s.tourInput, run: crm.scheduleTour as never },
		update: { schema: s.tourUpdate, run: crm.updateTour as never }
	},
	reports: {
		description: `Built-in reports (${REPORT_KEYS.join(', ')}); get one by key, \`?propertyId=\` to filter`,
		list: async () => REPORT_KEYS.map((key) => ({ key, ...REPORTS[key] })),
		get: (ctx, id) => {
			if (!(REPORT_KEYS as readonly string[]).includes(id)) error(404, 'Unknown report');
			return reports.runReport(ctx.orgId, id as ReportKey, {}, ctx);
		}
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
