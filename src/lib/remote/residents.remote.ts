import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/residents.ts';
import { amenityInput, bookingInput, idSchema, packageInput } from '#lib/schemas.ts';

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
