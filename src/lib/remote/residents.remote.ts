import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/residents.ts';
import {
	amenityInput,
	bookingInput,
	idSchema,
	keyInput,
	packageInput,
	passInput,
	permitInput,
	surveyInput,
	eventInput
} from '#lib/schemas.ts';

export const getAmenities = query(async () => svc.listAmenities((await requireOrg()).orgId));

export const getBookings = query(
	v.object({
		amenityId: idSchema,
		from: v.pipe(v.string(), v.isoTimestamp()),
		days: v.optional(v.number(), 7)
	}),
	async ({ amenityId, from, days }) => {
		const start = new Date(from);
		const end = new Date(start.getTime() + days * 86_400_000);
		return svc.listBookings((await requireOrg()).orgId, amenityId, start, end);
	}
);

export const createAmenity = command(amenityInput, async (input) => {
	const row = await svc.createAmenity(await requireOrg('admin'), input);
	void getAmenities().refresh();
	return { id: row.id };
});

export const deleteAmenity = command(idSchema, async (id) => {
	await svc.deleteAmenity(await requireOrg('admin'), id);
	void getAmenities().refresh();
});

export const bookSlot = command(bookingInput, async (input) => {
	const row = await svc.bookSlot(await requireOrg(), input);
	return { id: row.id };
});

export const cancelBooking = command(idSchema, async (id) => {
	await svc.cancelBooking(await requireOrg(), id);
});

export const getPackages = query(v.optional(v.boolean(), false), async (includePickedUp) =>
	svc.listPackages((await requireOrg()).orgId, { includePickedUp })
);

export const logPackage = command(packageInput, async (input) => {
	const row = await svc.logPackage(await requireOrg(), input);
	void getPackages(false).refresh();
	void getPackages(true).refresh();
	return { id: row.id };
});

export const markPickedUp = command(idSchema, async (id) => {
	await svc.markPickedUp(await requireOrg(), id);
	void getPackages(false).refresh();
	void getPackages(true).refresh();
});

// ---------- Parking ----------

export const getPermits = query(v.optional(v.boolean(), false), async (includeRevoked) =>
	svc.listPermits((await requireOrg()).orgId, { includeRevoked })
);

export const issuePermit = command(permitInput, async (input) => {
	const row = await svc.issuePermit(await requireOrg(), input);
	void getPermits(false).refresh();
	void getPermits(true).refresh();
	return { id: row.id };
});

export const revokePermit = command(idSchema, async (id) => {
	await svc.revokePermit(await requireOrg(), id);
	void getPermits(false).refresh();
	void getPermits(true).refresh();
});

// ---------- Keys ----------

export const getKeys = query(v.optional(v.boolean(), false), async (includeClosed) =>
	svc.listKeys((await requireOrg()).orgId, { includeClosed })
);

export const issueKey = command(keyInput, async (input) => {
	const row = await svc.issueKey(await requireOrg(), input);
	void getKeys(false).refresh();
	void getKeys(true).refresh();
	return { id: row.id };
});

export const closeKey = command(
	v.object({ id: idSchema, status: v.picklist(['returned', 'lost']) }),
	async ({ id, status }) => {
		await svc.closeKey(await requireOrg(), id, status);
		void getKeys(false).refresh();
		void getKeys(true).refresh();
	}
);

// ---------- Guest passes ----------

export const getPasses = query(v.optional(v.boolean(), false), async (includeVoid) =>
	svc.listPasses((await requireOrg()).orgId, { includeVoid })
);

export const createPass = command(passInput, async (input) => {
	const row = await svc.createPass(await requireOrg(), input);
	void getPasses(false).refresh();
	void getPasses(true).refresh();
	return { id: row.id };
});

export const closePass = command(
	v.object({ id: idSchema, status: v.picklist(['used', 'void']) }),
	async ({ id, status }) => {
		await svc.closePass(await requireOrg(), id, status);
		void getPasses(false).refresh();
		void getPasses(true).refresh();
	}
);

// ---------- Events ----------

export const getEvents = query(v.optional(v.boolean(), false), async (includeCancelled) =>
	svc.listEvents((await requireOrg()).orgId, { includeCancelled })
);

export const createEvent = command(eventInput, async (input) => {
	const row = await svc.createEvent(await requireOrg(), input);
	void getEvents(false).refresh();
	void getEvents(true).refresh();
	return { id: row.id };
});

export const cancelEvent = command(idSchema, async (id) => {
	await svc.cancelEvent(await requireOrg(), id);
	void getEvents(false).refresh();
	void getEvents(true).refresh();
});

// ---------- Surveys ----------

export const getSurveys = query(async () => svc.listSurveys((await requireOrg()).orgId));

export const getSurveyResponses = query(idSchema, async (surveyId) =>
	svc.listSurveyResponses((await requireOrg()).orgId, surveyId)
);

export const createSurvey = command(surveyInput, async (input) => {
	const row = await svc.createSurvey(await requireOrg(), input);
	void getSurveys().refresh();
	return { id: row.id };
});

export const closeSurvey = command(idSchema, async (id) => {
	await svc.closeSurvey(await requireOrg(), id);
	void getSurveys().refresh();
});
