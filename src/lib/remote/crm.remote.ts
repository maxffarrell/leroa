import { staffOrgForRecord } from '#lib/server/access.ts';
import { secureServices } from '#lib/server/access.ts';
import * as v from 'valibot';
import { inScope } from '#lib/remote/scope.ts';
import { command, getRequestEvent, query } from '$app/server';
import { getOrg, requireOrg, requirePerm, assertScope } from '#lib/server/context.ts';
import * as svcRaw from '#lib/server/services/crm.ts';
import { crmPolicy } from '#lib/server/access-policies.ts';
const svc = secureServices(svcRaw, crmPolicy);
import {
	idSchema,
	inquiryInput,
	leadInput,
	leadNoteInput,
	leadUpdate,
	leasingSettingsInput,
	propertyMarketingInput,
	tourBookingInput,
	tourInput,
	tourSlotsInput,
	tourUpdate
} from '#lib/schemas.ts';
import { getDashboard } from './workspace.remote.ts';

const ctx = async () => await requireOrg();
const orgId = async () => (await ctx()).orgId;

export const getLeads = query(async () => svc.listLeads(await orgId()));
export const getLead = query(idSchema, async (id) => svc.getLead(await orgId(), id));
export const getTours = query(async () => {
	const c = await ctx();
	return inScope(await svc.listTours(c.orgId), c.propertyIds);
});
export const getLeasingAttention = query(async () => svc.leasingAttention(await orgId()));
export const getLeasingBadge = query(async () => svc.leasingBadge(await orgId()));

function refreshLeads(id?: string) {
	void getLeads().refresh();
	void getLeasingBadge().refresh();
	void getLeasingAttention().refresh();
	void getDashboard().refresh();
	if (id) void getLead(id).refresh();
}

export const createLead = command(leadInput, async (input) => {
	const l = await svc.createLead(
		await assertScope(await requirePerm('leads', 'write'), input),
		input
	);
	refreshLeads(l.id);
	return { id: l.id, existing: l.existing };
});

export const updateLead = command(leadUpdate, async (input) => {
	await svc.updateLead(await assertScope(await requirePerm('leads', 'write'), input), input);
	refreshLeads(input.id);
	void getTours().refresh();
});

export const deleteLead = command(idSchema, async (id) => {
	await svc.deleteLead(await requireOrg('admin'), id);
	refreshLeads();
	void getTours().refresh();
});

export const addLeadNote = command(leadNoteInput, async (input) => {
	await svc.addLeadNote(await assertScope(await requirePerm('leads', 'write'), input), input);
	refreshLeads(input.leadId);
});

export const scheduleTour = command(tourInput, async (input) => {
	const t = await svc.scheduleTour(
		await assertScope(await requirePerm('tours', 'write'), input),
		input
	);
	refreshLeads(input.leadId);
	void getTours().refresh();
	return { id: t.id };
});

export const updateTour = command(tourUpdate, async (input) => {
	const t = await svc.updateTour(
		await assertScope(await requirePerm('tours', 'write'), input),
		input
	);
	refreshLeads(t.leadId);
	void getTours().refresh();
});

export const getLeasingSettings = query(async () => svc.getLeasingSettings(await orgId()));
export const saveLeasingSettings = command(leasingSettingsInput, async (input) => {
	await svc.saveLeasingSettings((await requireOrg('admin')).orgId, input);
	void getLeasingSettings().refresh();
});
export const initLeasingTimezone = command(v.pipe(v.string(), v.maxLength(64)), async (tz) => {
	await svc.initLeasingTimezone(await orgId(), tz);
	void getLeasingSettings().refresh();
});

export const getPropertyMarketing = query(idSchema, async (id) =>
	svc.getPropertyMarketing(await orgId(), id)
);
export const updatePropertyMarketing = command(propertyMarketingInput, async (input) => {
	await svc.updatePropertyMarketing(
		await assertScope(await requirePerm('leads', 'write'), input),
		input
	);
	void getPropertyMarketing(input.id).refresh();
});

export const getWaitlist = query(idSchema, async (listingId) =>
	svc.waitlistForListing(await orgId(), listingId)
);
export const emailWaitlist = command(idSchema, async (listingId) => {
	const r = await svc.emailWaitlist(await requirePerm('leads', 'write'), listingId);
	void getWaitlist(listingId).refresh();
	refreshLeads();
	return r;
});

// ── Public ──────────────────────────────────────────────────────────────────

function meta() {
	const event = getRequestEvent();
	let ip: string | null;
	try {
		ip = event.getClientAddress();
	} catch {
		ip = null;
	}
	return { ip, userAgent: event.request.headers.get('user-agent') };
}

export const getTourSlots = query(tourSlotsInput, async (input) =>
	svc.publicTourSlots(
		input,
		await staffOrgForRecord(await getOrg(), 'properties', 'properties', input.propertyId)
	)
);
export const submitInquiry = command(inquiryInput, async (input) =>
	svc.submitInquiry(input, meta())
);
export const bookTour = command(tourBookingInput, async (input) => {
	const r = await svc.bookTour(input, meta());
	void getTourSlots({ orgSlug: input.orgSlug, propertyId: input.propertyId }).refresh();
	return r;
});
