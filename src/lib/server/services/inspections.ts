import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	document,
	inspection,
	inspectionItem,
	lease,
	leaseTenant,
	organization,
	property,
	tenant,
	unit,
	user
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import type {
	inspectionAcknowledge,
	inspectionCreate,
	inspectionItemAdd,
	inspectionItemUpdate,
	inspectionUpdate
} from '#lib/schemas.ts';
import {
	CONDITION_LABEL,
	KIND_LABEL,
	defaultChecklist,
	groupByArea,
	matchKey,
	type Condition
} from '#lib/inspections.ts';
import { tenantName } from '#lib/format.ts';
import { inspectionPdf } from '#lib/server/pdf.ts';
import { IMAGE_TYPE, saveDocument } from './documents.ts';
import { emit } from './events.ts';
import { store } from './storage.ts';
import { createTicket } from './maintenance.ts';
import { notifyInspectionAcknowledged, notifyInspectionReady } from './notifications.ts';
import { portalTenants } from './portal.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const MAX_ITEM_PHOTOS = 12;
const MAX_ITEMS = 300;

const address = sql<string>`concat_ws(', ', nullif(${property.addressLine1}, ''), nullif(${property.city}, ''), nullif(${property.region}, ''))`;

export async function listInspections(orgId: string, opts: { leaseId?: string } = {}) {
	return db
		.select({
			id: inspection.id,
			kind: inspection.kind,
			status: inspection.status,
			scheduledFor: inspection.scheduledFor,
			completedAt: inspection.completedAt,
			acknowledgedAt: inspection.acknowledgedAt,
			hasTenantComment: sql<boolean>`${inspection.tenantComment} is not null`,
			createdAt: inspection.createdAt,
			leaseId: inspection.leaseId,
			unitId: unit.id,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name,
			total: sql<number>`(select count(*)::int from ${inspectionItem} where ${inspectionItem.inspectionId} = ${inspection.id})`,
			rated: sql<number>`(select count(*)::int from ${inspectionItem} where ${inspectionItem.inspectionId} = ${inspection.id} and ${inspectionItem.condition} is not null)`,
			flagged: sql<number>`(select count(*)::int from ${inspectionItem} where ${inspectionItem.inspectionId} = ${inspection.id} and ${inspectionItem.condition} in ('poor', 'damaged'))`
		})
		.from(inspection)
		.innerJoin(unit, eq(unit.id, inspection.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.where(
			and(
				eq(inspection.organizationId, orgId),
				opts.leaseId ? eq(inspection.leaseId, opts.leaseId) : undefined
			)
		)
		.orderBy(
			sql`${inspection.status} = 'completed'`,
			desc(
				sql`coalesce(${inspection.completedAt}, ${inspection.scheduledFor}::timestamptz, ${inspection.createdAt})`
			)
		);
}

async function loadInspection(orgId: string, id: string) {
	const [row] = await db
		.select({
			inspection,
			unitName: unit.name,
			propertyId: property.id,
			propertyName: property.name,
			address,
			completedByName: user.name
		})
		.from(inspection)
		.innerJoin(unit, eq(unit.id, inspection.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.leftJoin(user, eq(user.id, inspection.completedBy))
		.where(and(eq(inspection.organizationId, orgId), eq(inspection.id, id)));
	if (!row) error(404, 'Inspection not found');
	return row;
}

async function itemsOf(inspectionId: string) {
	return db
		.select()
		.from(inspectionItem)
		.where(eq(inspectionItem.inspectionId, inspectionId))
		.orderBy(asc(inspectionItem.position));
}

async function photosOf(orgId: string, itemIds: string[]) {
	if (!itemIds.length) return [];
	const rows = await db
		.select({
			id: document.id,
			name: document.name,
			contentType: document.contentType,
			storageKey: document.storageKey,
			itemId: document.entityId
		})
		.from(document)
		.where(
			and(
				eq(document.organizationId, orgId),
				eq(document.entityType, 'inspection_item'),
				inArray(document.entityId, itemIds)
			)
		)
		.orderBy(asc(document.createdAt));
	return rows.filter((r) => IMAGE_TYPE.test(r.contentType));
}

async function leaseTenantNames(leaseId: string | null) {
	if (!leaseId) return [];
	const rows = await db
		.select({
			id: tenant.id,
			kind: tenant.kind,
			firstName: tenant.firstName,
			lastName: tenant.lastName,
			companyName: tenant.companyName,
			email: tenant.email
		})
		.from(leaseTenant)
		.innerJoin(tenant, eq(tenant.id, leaseTenant.tenantId))
		.where(eq(leaseTenant.leaseId, leaseId))
		.orderBy(desc(leaseTenant.isPrimary));
	return rows.map((t) => ({ ...t, name: tenantName(t) }));
}

/** The latest completed move-in on the same lease, used as the baseline for a move-out. */
async function baselineFor(i: typeof inspection.$inferSelect) {
	if (i.kind !== 'move_out' || !i.leaseId) return null;
	const [base] = await db
		.select()
		.from(inspection)
		.where(
			and(
				eq(inspection.organizationId, i.organizationId),
				eq(inspection.leaseId, i.leaseId),
				eq(inspection.kind, 'move_in'),
				eq(inspection.status, 'completed')
			)
		)
		.orderBy(desc(inspection.completedAt))
		.limit(1);
	return base ?? null;
}

export async function getInspection(orgId: string, id: string) {
	const row = await loadInspection(orgId, id);
	const i = row.inspection;
	const [items, tenants, base] = await Promise.all([
		itemsOf(i.id),
		leaseTenantNames(i.leaseId),
		baselineFor(i)
	]);
	const baseItems = base ? await itemsOf(base.id) : [];
	const before = new Map(baseItems.map((b) => [matchKey(b), b]));
	const photos = await photosOf(
		orgId,
		[...items, ...baseItems].map((x) => x.id)
	);
	const photosFor = (itemId: string) =>
		photos.filter((p) => p.itemId === itemId).map((p) => ({ id: p.id, name: p.name }));

	return {
		...i,
		unitName: row.unitName,
		propertyId: row.propertyId,
		propertyName: row.propertyName,
		address: row.address,
		completedByName: row.completedByName,
		tenants: tenants.map((t) => ({ id: t.id, name: t.name })),
		baseline: base ? { id: base.id, completedAt: base.completedAt } : null,
		items: items.map((it) => {
			const b = before.get(matchKey(it));
			return {
				...it,
				photos: photosFor(it.id),
				before: b ? { condition: b.condition, notes: b.notes, photos: photosFor(b.id) } : null
			};
		})
	};
}

export async function createInspection(ctx: OrgContext, input: Out<typeof inspectionCreate>) {
	const [u] = await db
		.select({ id: unit.id, bedrooms: unit.bedrooms, bathrooms: unit.bathrooms })
		.from(unit)
		.where(and(eq(unit.organizationId, ctx.orgId), eq(unit.id, input.unitId)));
	if (!u) error(404, 'Unit not found');

	let leaseId = input.leaseId ?? null;
	if (leaseId) {
		const [l] = await db
			.select({ unitId: lease.unitId })
			.from(lease)
			.where(and(eq(lease.organizationId, ctx.orgId), eq(lease.id, leaseId)));
		if (!l) error(404, 'Lease not found');
		if (l.unitId !== u.id) error(400, 'That lease is for a different unit');
	} else {
		const statuses =
			input.kind === 'move_out'
				? (['active', 'ended', 'terminated'] as const)
				: (['active', 'draft'] as const);
		const [l] = await db
			.select({ id: lease.id })
			.from(lease)
			.where(
				and(
					eq(lease.organizationId, ctx.orgId),
					eq(lease.unitId, u.id),
					inArray(lease.status, [...statuses])
				)
			)
			.orderBy(desc(lease.startDate))
			.limit(1);
		leaseId = l?.id ?? null;
	}

	const created = await db.transaction(async (tx) => {
		const [i] = await tx
			.insert(inspection)
			.values({
				organizationId: ctx.orgId,
				unitId: u.id,
				leaseId,
				kind: input.kind,
				scheduledFor: input.scheduledFor ?? null,
				createdBy: ctx.userId
			})
			.returning();
		const base = await baselineFor(i!);
		const checklist = base
			? (await itemsOf(base.id)).map(({ area, label }) => ({ area, label }))
			: defaultChecklist(u);
		await tx.insert(inspectionItem).values(
			checklist.map((c, position) => ({
				organizationId: ctx.orgId,
				inspectionId: i!.id,
				area: c.area,
				label: c.label,
				position
			}))
		);
		return i!;
	});
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'inspection',
		entityId: created.id,
		action: 'created',
		summary: `${KIND_LABEL[created.kind]} inspection started`,
		data: { unitId: created.unitId, leaseId: created.leaseId, kind: created.kind }
	});
	return created;
}

async function openInspection(orgId: string, id: string) {
	const [i] = await db
		.select()
		.from(inspection)
		.where(and(eq(inspection.organizationId, orgId), eq(inspection.id, id)));
	if (!i) error(404, 'Inspection not found');
	if (i.status !== 'in_progress')
		error(409, 'This inspection is completed and can no longer change');
	return i;
}

async function openItem(orgId: string, itemId: string) {
	const [row] = await db
		.select({ item: inspectionItem, status: inspection.status })
		.from(inspectionItem)
		.innerJoin(inspection, eq(inspection.id, inspectionItem.inspectionId))
		.where(and(eq(inspectionItem.organizationId, orgId), eq(inspectionItem.id, itemId)));
	if (!row) error(404, 'Item not found');
	if (row.status !== 'in_progress')
		error(409, 'This inspection is completed and can no longer change');
	return row.item;
}

export async function updateInspection(ctx: OrgContext, input: Out<typeof inspectionUpdate>) {
	await openInspection(ctx.orgId, input.id);
	const [i] = await db
		.update(inspection)
		.set({
			...(input.scheduledFor !== undefined && { scheduledFor: input.scheduledFor }),
			...(input.summary !== undefined && { summary: input.summary || null })
		})
		.where(and(eq(inspection.organizationId, ctx.orgId), eq(inspection.id, input.id)))
		.returning();
	return i!;
}

export async function deleteInspection(ctx: OrgContext, id: string) {
	const i = await openInspection(ctx.orgId, id);
	const items = await itemsOf(i.id);
	const photos = await photosOf(
		ctx.orgId,
		items.map((x) => x.id)
	);
	await db.transaction(async (tx) => {
		if (photos.length)
			await tx.delete(document).where(
				inArray(
					document.id,
					photos.map((p) => p.id)
				)
			);
		await tx.delete(inspection).where(eq(inspection.id, i.id));
	});
	for (const p of photos) await store.delete(p.storageKey);
	return i;
}

export async function addItem(ctx: OrgContext, input: Out<typeof inspectionItemAdd>) {
	const i = await openInspection(ctx.orgId, input.inspectionId);
	const [{ n, last }] = (await db
		.select({
			n: sql<number>`count(*)::int`,
			last: sql<
				number | null
			>`max(${inspectionItem.position}) filter (where lower(${inspectionItem.area}) = lower(${input.area}))`
		})
		.from(inspectionItem)
		.where(eq(inspectionItem.inspectionId, i.id))) as [{ n: number; last: number | null }];
	if (n >= MAX_ITEMS) error(400, `An inspection can have up to ${MAX_ITEMS} items`);
	// Insert after the area's last item, or at the end for a new area.
	const position = last === null ? n + 1 : last + 1;
	return db.transaction(async (tx) => {
		await tx
			.update(inspectionItem)
			.set({ position: sql`${inspectionItem.position} + 1` })
			.where(
				and(eq(inspectionItem.inspectionId, i.id), sql`${inspectionItem.position} >= ${position}`)
			);
		const [item] = await tx
			.insert(inspectionItem)
			.values({
				organizationId: ctx.orgId,
				inspectionId: i.id,
				area: input.area,
				label: input.label,
				position
			})
			.returning();
		return item!;
	});
}

export async function updateItem(ctx: OrgContext, input: Out<typeof inspectionItemUpdate>) {
	const item = await openItem(ctx.orgId, input.id);
	const [updated] = await db
		.update(inspectionItem)
		.set({
			...(input.label !== undefined && { label: input.label }),
			...(input.condition !== undefined && { condition: input.condition }),
			...(input.notes !== undefined && { notes: input.notes || null })
		})
		.where(eq(inspectionItem.id, item.id))
		.returning();
	return updated!;
}

export async function deleteItem(ctx: OrgContext, id: string) {
	const item = await openItem(ctx.orgId, id);
	const photos = await photosOf(ctx.orgId, [item.id]);
	if (photos.length)
		await db.delete(document).where(
			inArray(
				document.id,
				photos.map((p) => p.id)
			)
		);
	for (const p of photos) await store.delete(p.storageKey);
	await db.delete(inspectionItem).where(eq(inspectionItem.id, item.id));
	return item;
}

export async function uploadItemPhotos(ctx: OrgContext, itemId: string, files: File[]) {
	const item = await openItem(ctx.orgId, itemId);
	const images = files.filter((f) => IMAGE_TYPE.test(f.type));
	if (!images.length) error(400, 'Photos must be PNG, JPEG, GIF, WebP or AVIF images');
	const existing = (await photosOf(ctx.orgId, [item.id])).length;
	if (existing + images.length > MAX_ITEM_PHOTOS)
		error(400, `Each item can have up to ${MAX_ITEM_PHOTOS} photos`);
	const docs = [];
	for (const f of images)
		docs.push(
			await saveDocument(ctx.orgId, ctx.userId, f, { type: 'inspection_item', id: item.id })
		);
	return docs.map((d) => ({ id: d.id, name: d.name }));
}

async function renderPdf(orgId: string, id: string) {
	const i = await getInspection(orgId, id);
	const [org] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId));
	const ids = i.items.flatMap((it) => it.photos.map((p) => p.id));
	const docs = ids.length
		? await db
				.select({ id: document.id, contentType: document.contentType, key: document.storageKey })
				.from(document)
				.where(and(eq(document.organizationId, orgId), inArray(document.id, ids)))
		: [];
	const byId = new Map(docs.map((d) => [d.id, d]));
	const ackBy = i.acknowledgedBy
		? (await db.select({ name: user.name }).from(user).where(eq(user.id, i.acknowledgedBy)))[0]
				?.name
		: null;
	const label = (c: Condition | null | undefined) => (c ? CONDITION_LABEL[c] : 'Not rated');

	const areas = [];
	for (const g of groupByArea(i.items)) {
		const items = [];
		for (const it of g.items) {
			const photos = [];
			for (const p of it.photos) {
				const d = byId.get(p.id);
				if (!d) continue;
				const data = /^image\/(jpeg|png)$/.test(d.contentType) ? await store.get(d.key) : null;
				photos.push({ type: d.contentType, data: data ?? new Uint8Array() });
			}
			items.push({
				label: it.label,
				condition: label(it.condition),
				before: i.baseline && it.before ? label(it.before.condition) : null,
				notes: it.notes,
				photos
			});
		}
		areas.push({ area: g.area, items });
	}
	const title = `${KIND_LABEL[i.kind]} inspection · ${i.propertyName} ${i.unitName}`;
	const bytes = await inspectionPdf({
		title,
		orgName: org?.name ?? '',
		address: [i.propertyName, `Unit ${i.unitName}`, i.address].filter(Boolean).join(' · '),
		tenants: i.tenants.map((t) => t.name),
		inspectedAt: i.completedAt,
		inspector: i.completedByName,
		summary: i.summary,
		watermark: i.status === 'completed' ? null : 'IN PROGRESS - NOT FINAL',
		areas,
		acknowledgement: i.acknowledgedAt
			? { at: i.acknowledgedAt, name: ackBy ?? 'Resident', comment: i.tenantComment }
			: null
	});
	return { inspection: i, title, bytes };
}

/** Freezes the inspection and saves its PDF report to the lease (or unit). */
export async function completeInspection(
	ctx: OrgContext,
	id: string,
	summary?: string | null,
	opts: { notify?: boolean } = {}
) {
	const i = await openInspection(ctx.orgId, id);
	const [{ unrated }] = (await db
		.select({ unrated: sql<number>`count(*)::int` })
		.from(inspectionItem)
		.where(
			and(eq(inspectionItem.inspectionId, i.id), sql`${inspectionItem.condition} is null`)
		)) as [{ unrated: number }];
	if (unrated > 0)
		error(409, `Rate every item first (${unrated} left). Use N/A for anything that doesn’t apply.`);

	const [done] = await db
		.update(inspection)
		.set({
			status: 'completed',
			completedAt: new Date(),
			completedBy: ctx.userId,
			...(summary !== undefined && { summary: summary || null })
		})
		.where(and(eq(inspection.id, i.id), eq(inspection.status, 'in_progress')))
		.returning();
	if (!done) error(409, 'This inspection was already completed');

	const { title, bytes, inspection: full } = await renderPdf(ctx.orgId, i.id);
	const storageKey = `${ctx.orgId}/${randomUUID()}`;
	await store.put(storageKey, bytes);
	const [doc] = await db
		.insert(document)
		.values({
			organizationId: ctx.orgId,
			name: `${title}.pdf`.slice(0, 200),
			contentType: 'application/pdf',
			size: bytes.length,
			storageKey,
			entityType: done.leaseId ? 'lease' : 'unit',
			entityId: done.leaseId ?? done.unitId,
			uploadedBy: ctx.userId
		})
		.returning();
	await db.update(inspection).set({ documentId: doc!.id }).where(eq(inspection.id, i.id));

	const flagged = full.items.filter((x) => x.condition === 'poor' || x.condition === 'damaged');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'inspection',
		entityId: i.id,
		action: 'completed',
		summary: `${KIND_LABEL[done.kind]} inspection of ${full.propertyName} ${full.unitName} completed${flagged.length ? ` · ${flagged.length} need attention` : ''}`,
		data: { unitId: done.unitId, leaseId: done.leaseId, kind: done.kind, flagged: flagged.length }
	});
	if (opts.notify !== false && done.leaseId && done.kind !== 'routine') {
		const recipients = await leaseTenantNames(done.leaseId);
		void notifyInspectionReady(ctx.orgId, { id: done.id, kind: done.kind }, recipients).catch(
			(err) => console.error('inspection email failed', err)
		);
	}
	return { ...done, documentId: doc!.id };
}

/** Opens a maintenance request for an item marked poor or damaged. */
export async function createRepairTicket(ctx: OrgContext, itemId: string) {
	const [row] = await db
		.select({ item: inspectionItem, i: inspection, propertyId: unit.propertyId })
		.from(inspectionItem)
		.innerJoin(inspection, eq(inspection.id, inspectionItem.inspectionId))
		.innerJoin(unit, eq(unit.id, inspection.unitId))
		.where(and(eq(inspectionItem.organizationId, ctx.orgId), eq(inspectionItem.id, itemId)));
	if (!row) error(404, 'Item not found');
	const { item, i } = row;
	return createTicket(ctx, {
		propertyId: row.propertyId,
		unitId: i.unitId,
		tenantId: null,
		title: `${item.area}: ${item.label}`.slice(0, 200),
		description: [
			`Found during the ${KIND_LABEL[i.kind].toLowerCase()} inspection (${item.condition ? CONDITION_LABEL[item.condition].toLowerCase() : 'not rated'}).`,
			item.notes
		]
			.filter(Boolean)
			.join('\n\n'),
		priority: item.condition === 'damaged' ? 'high' : 'normal',
		status: 'open',
		assigneeId: null,
		vendorId: null,
		costAmount: null,
		dueDate: null
	});
}

/** Completed move-in and move-out reports on leases the portal user is a tenant on. */
export async function portalInspections(tenantIds: string[]) {
	if (!tenantIds.length) return [];
	return db
		.selectDistinct({
			id: inspection.id,
			leaseId: inspection.leaseId,
			kind: inspection.kind,
			completedAt: inspection.completedAt,
			acknowledgedAt: inspection.acknowledgedAt,
			tenantComment: inspection.tenantComment
		})
		.from(inspection)
		.innerJoin(leaseTenant, eq(leaseTenant.leaseId, inspection.leaseId))
		.where(
			and(
				inArray(leaseTenant.tenantId, tenantIds),
				eq(inspection.status, 'completed'),
				inArray(inspection.kind, ['move_in', 'move_out'])
			)
		)
		.orderBy(desc(inspection.completedAt));
}

async function portalAccess(userId: string, id: string) {
	const tenants = await portalTenants(userId);
	const visible = await portalInspections(tenants.map((t) => t.tenant.id));
	const i = visible.find((x) => x.id === id);
	if (!i) error(404, 'Inspection not found');
	const [row] = await db.select().from(inspection).where(eq(inspection.id, id));
	return row!;
}

/** A resident confirms they reviewed the report, optionally noting anything they disagree with. */
export async function acknowledgeInspection(
	userId: string,
	input: Out<typeof inspectionAcknowledge>
) {
	const i = await portalAccess(userId, input.id);
	const [done] = await db
		.update(inspection)
		.set({
			acknowledgedAt: new Date(),
			acknowledgedBy: userId,
			tenantComment: input.comment || null
		})
		.where(and(eq(inspection.id, i.id), sql`${inspection.acknowledgedAt} is null`))
		.returning();
	if (!done) error(409, 'This report was already reviewed');

	// Replace the stored PDF so the saved copy includes the resident's review.
	if (done.documentId) {
		const [doc] = await db.select().from(document).where(eq(document.id, done.documentId));
		if (doc) {
			const { bytes } = await renderPdf(done.organizationId, done.id);
			const storageKey = `${done.organizationId}/${randomUUID()}`;
			await store.put(storageKey, bytes);
			await db
				.update(document)
				.set({ storageKey, size: bytes.length })
				.where(eq(document.id, doc.id));
			await store.delete(doc.storageKey);
		}
	}
	await emit({
		orgId: done.organizationId,
		actorId: userId,
		entityType: 'inspection',
		entityId: done.id,
		action: 'acknowledged',
		summary: `Resident reviewed the ${KIND_LABEL[done.kind].toLowerCase()} inspection${done.tenantComment ? ' and left comments' : ''}`,
		data: { leaseId: done.leaseId, comment: done.tenantComment }
	});
	void notifyInspectionAcknowledged(done.organizationId, done).catch((err) =>
		console.error('inspection email failed', err)
	);
	return { acknowledgedAt: done.acknowledgedAt };
}

/** PDF for staff of the workspace, or for a resident on the inspected lease. */
export async function inspectionFile(
	id: string,
	access: { orgId: string | null; userId: string | null }
) {
	const [i] = await db.select().from(inspection).where(eq(inspection.id, id));
	if (!i) error(404, 'Inspection not found');
	if (i.organizationId !== access.orgId) {
		if (!access.userId) error(404, 'Inspection not found');
		await portalAccess(access.userId, id);
	}
	if (i.status === 'completed' && i.documentId) {
		const [doc] = await db.select().from(document).where(eq(document.id, i.documentId));
		const data = doc && (await store.get(doc.storageKey));
		if (data) return { name: doc.name, data };
	}
	const { title, bytes } = await renderPdf(i.organizationId, i.id);
	return { name: `${title}.pdf`, data: bytes };
}
