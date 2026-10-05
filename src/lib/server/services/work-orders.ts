import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { BETTER_AUTH_SECRET } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import {
	document,
	maintenanceTicket,
	organization,
	property,
	ticketNote,
	unit,
	vendor
} from '#lib/server/db/schema.ts';
import type { workOrderUpdate } from '#lib/schemas.ts';
import { IMAGE_TYPE, entityImages, saveDocument } from './documents.ts';
import { store } from './storage.ts';
import { emit } from './events.ts';
import { notifyTicketStatus, notifyVendorUpdate } from './notifications.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

/** Photos a vendor may add to one work order through their link. */
const MAX_LINK_PHOTOS = 30;

function sign(payload: string) {
	return createHmac('sha256', BETTER_AUTH_SECRET)
		.update(`work-order:${payload}`)
		.digest('base64url');
}

/**
 * A signed link for the vendor assigned to a ticket. It stops working as soon as
 * the ticket is reassigned, so there is nothing to revoke or store.
 */
export function workOrderToken(ticketId: string, vendorId: string) {
	const payload = `${ticketId}.${vendorId}`;
	return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function verify(token: string) {
	const [encoded, sig] = token.split('.');
	if (!encoded || !sig) return null;
	const payload = Buffer.from(encoded, 'base64url').toString();
	const expected = Buffer.from(sign(payload));
	const given = Buffer.from(sig);
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
	const [ticketId, vendorId] = payload.split('.');
	return ticketId && vendorId ? { ticketId, vendorId } : null;
}

async function load(token: string) {
	const ids = verify(token);
	if (!ids) error(404, 'This work order link is not valid');
	const [row] = await db
		.select({
			ticket: maintenanceTicket,
			vendorName: vendor.name,
			orgName: organization.name,
			property: {
				name: property.name,
				addressLine1: property.addressLine1,
				addressLine2: property.addressLine2,
				city: property.city,
				region: property.region,
				postalCode: property.postalCode
			},
			unitName: unit.name
		})
		.from(maintenanceTicket)
		.innerJoin(vendor, eq(vendor.id, maintenanceTicket.vendorId))
		.innerJoin(property, eq(property.id, maintenanceTicket.propertyId))
		.innerJoin(organization, eq(organization.id, maintenanceTicket.organizationId))
		.leftJoin(unit, eq(unit.id, maintenanceTicket.unitId))
		.where(
			and(eq(maintenanceTicket.id, ids.ticketId), eq(maintenanceTicket.vendorId, ids.vendorId))
		);
	if (!row) error(404, 'This work order is no longer assigned to you');
	return { ...row, vendorId: ids.vendorId };
}

export async function getWorkOrder(token: string) {
	const row = await load(token);
	const t = row.ticket;
	const [photos, notes] = await Promise.all([
		entityImages(t.organizationId, 'maintenance', t.id),
		db
			.select({
				id: ticketNote.id,
				authorType: ticketNote.authorType,
				authorName: ticketNote.authorName,
				body: ticketNote.body,
				createdAt: ticketNote.createdAt
			})
			.from(ticketNote)
			.where(and(eq(ticketNote.ticketId, t.id), eq(ticketNote.internal, false)))
			.orderBy(asc(ticketNote.createdAt))
	]);
	return {
		number: t.number,
		title: t.title,
		description: t.description,
		status: t.status,
		priority: t.priority,
		dueDate: t.dueDate,
		costAmount: t.costAmount,
		createdAt: t.createdAt,
		orgName: row.orgName,
		vendorName: row.vendorName,
		property: row.property,
		unitName: row.unitName,
		photos: photos.map((p) => ({ id: p.id, name: p.name })),
		notes
	};
}

export type WorkOrder = Awaited<ReturnType<typeof getWorkOrder>>;

const STATUS_LABEL = {
	in_progress: 'started work',
	on_hold: 'put it on hold',
	done: 'marked it done'
};

export async function updateWorkOrder(input: Out<typeof workOrderUpdate>) {
	const row = await load(input.token);
	const t = row.ticket;
	if (t.status === 'cancelled') error(409, 'This work order was cancelled');
	const status = input.status && input.status !== t.status ? input.status : undefined;
	if (status && t.status === 'done') error(409, 'This work order is already complete');
	const cost = input.costAmount !== undefined && input.costAmount !== t.costAmount;
	const note = input.note?.trim() || null;
	if (!status && !cost && !note) error(400, 'Nothing to update');

	const { updated, noteId } = await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(maintenanceTicket)
			.set({
				...(status ? { status, closedAt: status === 'done' ? new Date() : null } : {}),
				...(cost ? { costAmount: input.costAmount } : {}),
				updatedAt: new Date()
			})
			.where(eq(maintenanceTicket.id, t.id))
			.returning();
		const [n] = note
			? await tx
					.insert(ticketNote)
					.values({
						organizationId: t.organizationId,
						ticketId: t.id,
						authorType: 'vendor',
						vendorId: row.vendorId,
						authorName: row.vendorName,
						body: note
					})
					.returning({ id: ticketNote.id })
			: [];
		return { updated: updated!, noteId: n?.id ?? null };
	});

	const changes = [
		status ? STATUS_LABEL[status] : null,
		cost ? 'updated the cost' : null,
		note ? 'added a note' : null
	].filter((x): x is string => !!x);
	await emit({
		orgId: t.organizationId,
		entityType: 'maintenance',
		entityId: t.id,
		action: 'updated',
		summary: `#${t.number} ${row.vendorName} ${changes.join(', ')}`,
		data: { source: 'vendor', ...(status ? { status } : {}) }
	});
	if (status)
		void notifyTicketStatus(updated).catch((err) => console.error('ticket email failed', err));
	void notifyVendorUpdate(
		updated,
		row.vendorName,
		changes,
		note,
		noteId ?? `${t.id}:${status ?? 'cost'}:${Date.now()}`
	).catch((err) => console.error('vendor update email failed', err));
}

export async function uploadWorkOrderPhotos(token: string, files: File[]) {
	const row = await load(token);
	const t = row.ticket;
	if (t.status === 'cancelled') error(409, 'This work order was cancelled');
	const images = files.filter((f) => IMAGE_TYPE.test(f.type));
	if (!images.length) error(400, 'Photos must be JPEG, PNG, WebP, GIF or AVIF');
	const existing = await entityImages(t.organizationId, 'maintenance', t.id);
	if (existing.length + images.length > MAX_LINK_PHOTOS)
		error(400, `A work order can have up to ${MAX_LINK_PHOTOS} photos`);
	for (const f of images)
		await saveDocument(t.organizationId, null, f, { type: 'maintenance', id: t.id });
	return images.length;
}

export async function workOrderPhoto(token: string, photoId: string) {
	const row = await load(token);
	const [doc] = await db
		.select()
		.from(document)
		.where(
			and(
				eq(document.id, photoId),
				eq(document.organizationId, row.ticket.organizationId),
				eq(document.entityType, 'maintenance'),
				eq(document.entityId, row.ticket.id)
			)
		);
	if (!doc || !IMAGE_TYPE.test(doc.contentType)) error(404, 'Not found');
	const data = await store.get(doc.storageKey);
	if (!data) error(404, 'Not found');
	return { doc, data };
}
