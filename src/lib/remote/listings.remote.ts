import * as v from 'valibot';
import { command, getRequestEvent, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/listings.ts';
import { deleteDocument } from '#lib/server/services/documents.ts';
import {
	applicationApprove,
	applicationInput,
	applicationUpdate,
	idSchema,
	listingCreate,
	listingStatusInput,
	listingUpdate
} from '#lib/schemas.ts';
import { getLeases } from './leasing.remote.ts';
import { getTenants } from './portfolio.remote.ts';

export const getListings = query(async () => svc.listListings((await requireOrg()).orgId));
export const getListing = query(idSchema, async (id) =>
	svc.getListing((await requireOrg()).orgId, id)
);

export const createListing = command(listingCreate, async (input) => {
	const l = await svc.createListing(await requireOrg(), input);
	void getListings().refresh();
	return l;
});

export const updateListing = command(listingUpdate, async (input) => {
	const l = await svc.updateListing(await requireOrg(), input);
	void getListing(l.id).refresh();
	void getListings().refresh();
	return { id: l.id };
});

export const setListingStatus = command(listingStatusInput, async (input) => {
	await svc.setListingStatus(await requireOrg(), input);
	void getListing(input.id).refresh();
	void getListings().refresh();
});

export const deleteListing = command(idSchema, async (id) => {
	await svc.deleteListing(await requireOrg('admin'), id);
	void getListings().refresh();
});

export const removeListingPhoto = command(
	v.object({ listingId: idSchema, photoId: idSchema }),
	async ({ listingId, photoId }) => {
		const ctx = await requireOrg();
		const l = await svc.getListing(ctx.orgId, listingId);
		if (!l.photos.some((p) => p.id === photoId)) return;
		await deleteDocument(ctx, photoId);
		void getListing(listingId).refresh();
		void getListings().refresh();
	}
);

export const getApplications = query(async () => svc.listApplications((await requireOrg()).orgId));
export const getApplication = query(idSchema, async (id) =>
	svc.getApplication((await requireOrg()).orgId, id)
);

export const updateApplication = command(applicationUpdate, async (input) => {
	await svc.updateApplication(await requireOrg(), input);
	void getApplication(input.id).refresh();
	void getApplications().refresh();
	void getListings().refresh();
});

export const approveApplication = command(applicationApprove, async (input) => {
	const r = await svc.approveApplication(await requireOrg(), input);
	void getApplication(input.id).refresh();
	void getApplications().refresh();
	void getListings().refresh();
	void getLeases().refresh();
	void getTenants().refresh();
	return r;
});

/** Public: anyone can apply to a published listing. */
export const submitApplication = command(applicationInput, async (input) => {
	const event = getRequestEvent();
	let ip: string | null;
	try {
		ip = event.getClientAddress();
	} catch {
		ip = null;
	}
	return svc.submitApplication(input, {
		ip,
		userAgent: event.request.headers.get('user-agent')
	});
});
