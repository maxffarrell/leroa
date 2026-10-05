import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	agreementSigner,
	document,
	lease,
	leaseAgreement,
	leaseTemplate,
	leaseTenant,
	organization,
	property,
	tenant,
	unit
} from '#lib/server/db/schema.ts';
import type { OrgContext } from '#lib/server/context.ts';
import { agreementPdf } from '#lib/server/pdf.ts';
import { STARTER_TEMPLATE, ordinal, renderTemplate, type MergeValues } from '#lib/agreements.ts';
import { formatDate, formatMoney, tenantName, todayISO } from '#lib/format.ts';
import type { agreementCreate, agreementUpdate, templateInput } from '#lib/schemas.ts';
import { emit } from './events.ts';
import { notifyAgreementSent, notifyAgreementSigned } from './notifications.ts';
import { store } from './storage.ts';
import { portalTenants } from './portal.ts';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

const WATERMARK: Record<string, string | null> = {
	draft: 'DRAFT - NOT FOR SIGNATURE',
	sent: null,
	signed: null,
	void: 'VOID - NO LONGER VALID'
};

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export async function listTemplates(orgId: string) {
	return db
		.select()
		.from(leaseTemplate)
		.where(eq(leaseTemplate.organizationId, orgId))
		.orderBy(asc(leaseTemplate.name));
}

export async function saveTemplate(ctx: OrgContext, input: Out<typeof templateInput>) {
	if (input.id) {
		const [t] = await db
			.update(leaseTemplate)
			.set({ name: input.name, body: input.body })
			.where(and(eq(leaseTemplate.organizationId, ctx.orgId), eq(leaseTemplate.id, input.id)))
			.returning();
		if (!t) error(404, 'Template not found');
		return t;
	}
	const [t] = await db
		.insert(leaseTemplate)
		.values({ organizationId: ctx.orgId, name: input.name, body: input.body })
		.returning();
	return t!;
}

export async function deleteTemplate(ctx: OrgContext, id: string) {
	await db
		.delete(leaseTemplate)
		.where(and(eq(leaseTemplate.organizationId, ctx.orgId), eq(leaseTemplate.id, id)));
}

const FREQUENCY: Record<string, string> = {
	monthly: 'per month',
	weekly: 'per week',
	quarterly: 'per quarter',
	yearly: 'per year'
};

const joinNames = (names: string[]) =>
	names.length <= 1
		? (names[0] ?? '')
		: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

async function leaseFacts(orgId: string, leaseId: string) {
	const [row] = await db
		.select({ lease, unit, property, orgName: organization.name })
		.from(lease)
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.innerJoin(organization, eq(organization.id, lease.organizationId))
		.where(and(eq(lease.organizationId, orgId), eq(lease.id, leaseId)));
	if (!row) error(404, 'Lease not found');
	const tenants = await db
		.select({ tenant })
		.from(leaseTenant)
		.innerJoin(tenant, eq(tenant.id, leaseTenant.tenantId))
		.where(eq(leaseTenant.leaseId, leaseId))
		.orderBy(desc(leaseTenant.isPrimary));
	return { ...row, tenants: tenants.map((t) => t.tenant) };
}

export function mergeValues(f: Awaited<ReturnType<typeof leaseFacts>>): MergeValues {
	const { lease: l, property: p } = f;
	const money = (c: number) => formatMoney(c, l.currency);
	return {
		organization_name: f.orgName,
		tenant_names: joinNames(f.tenants.map(tenantName)),
		property_name: p.name,
		property_address: [
			p.addressLine1,
			p.addressLine2,
			p.city,
			[p.region, p.postalCode].filter(Boolean).join(' ')
		]
			.filter(Boolean)
			.join(', '),
		unit_name: f.unit.name,
		start_date: formatDate(l.startDate),
		end_date: l.endDate ? formatDate(l.endDate) : 'no fixed date (month to month)',
		rent_amount: money(l.rentAmount),
		rent_frequency: FREQUENCY[l.frequency] ?? l.frequency,
		rent_due_day: ordinal(l.rentDueDay),
		deposit_amount: money(l.depositAmount),
		late_fee_amount: l.lateFeeAmount ? money(l.lateFeeAmount) : 'no fee',
		late_fee_grace_days: String(l.lateFeeGraceDays),
		today: formatDate(todayISO())
	};
}

async function signersOf(ids: string[]) {
	if (!ids.length) return [];
	return db
		.select()
		.from(agreementSigner)
		.where(inArray(agreementSigner.agreementId, ids))
		.orderBy(asc(agreementSigner.name));
}

export async function listAgreements(orgId: string, leaseId: string) {
	const rows = await db
		.select()
		.from(leaseAgreement)
		.where(and(eq(leaseAgreement.organizationId, orgId), eq(leaseAgreement.leaseId, leaseId)))
		.orderBy(desc(leaseAgreement.createdAt));
	const signers = await signersOf(rows.map((r) => r.id));
	return rows.map((r) => ({
		...r,
		signers: signers
			.filter((s) => s.agreementId === r.id)
			.map((s) => ({ tenantId: s.tenantId, name: s.name, email: s.email, signedAt: s.signedAt }))
	}));
}

async function getAgreement(orgId: string, id: string) {
	const [a] = await db
		.select()
		.from(leaseAgreement)
		.where(and(eq(leaseAgreement.organizationId, orgId), eq(leaseAgreement.id, id)));
	if (!a) error(404, 'Agreement not found');
	return a;
}

export async function createAgreement(ctx: OrgContext, input: Out<typeof agreementCreate>) {
	const facts = await leaseFacts(ctx.orgId, input.leaseId);
	let template: { id: string | null; name: string; body: string } = {
		id: null,
		...STARTER_TEMPLATE
	};
	if (input.templateId) {
		const [t] = await db
			.select()
			.from(leaseTemplate)
			.where(
				and(eq(leaseTemplate.organizationId, ctx.orgId), eq(leaseTemplate.id, input.templateId))
			);
		if (!t) error(404, 'Template not found');
		template = t;
	}
	const { text } = renderTemplate(template.body, mergeValues(facts));
	const [a] = await db
		.insert(leaseAgreement)
		.values({
			organizationId: ctx.orgId,
			leaseId: input.leaseId,
			templateId: template.id,
			title: `${template.name} · ${facts.property.name} ${facts.unit.name}`.slice(0, 200),
			body: text,
			createdBy: ctx.userId
		})
		.returning();
	return a!;
}

export async function updateAgreement(ctx: OrgContext, input: Out<typeof agreementUpdate>) {
	const [a] = await db
		.update(leaseAgreement)
		.set({ title: input.title, body: input.body })
		.where(
			and(
				eq(leaseAgreement.organizationId, ctx.orgId),
				eq(leaseAgreement.id, input.id),
				eq(leaseAgreement.status, 'draft')
			)
		)
		.returning();
	if (!a) error(409, 'Only drafts can be edited');
	return a;
}

export async function deleteDraft(ctx: OrgContext, id: string) {
	const [a] = await db
		.delete(leaseAgreement)
		.where(
			and(
				eq(leaseAgreement.organizationId, ctx.orgId),
				eq(leaseAgreement.id, id),
				eq(leaseAgreement.status, 'draft')
			)
		)
		.returning();
	if (!a) error(409, 'Only drafts can be deleted. Void a sent agreement instead.');
	return a;
}

export async function sendAgreement(ctx: OrgContext, id: string) {
	const a = await getAgreement(ctx.orgId, id);
	if (a.status !== 'draft') error(409, 'This agreement was already sent');
	const { tenants } = await leaseFacts(ctx.orgId, a.leaseId);
	if (!tenants.length) error(400, 'Add a tenant to the lease first');
	const signers = tenants.map((t) => ({ tenantId: t.id, name: tenantName(t), email: t.email }));

	const sent = await db.transaction(async (tx) => {
		const [row] = await tx
			.update(leaseAgreement)
			.set({ status: 'sent', sentAt: new Date(), contentHash: sha256(a.body) })
			.where(and(eq(leaseAgreement.id, id), eq(leaseAgreement.status, 'draft')))
			.returning();
		if (!row) error(409, 'This agreement was already sent');
		await tx.insert(agreementSigner).values(signers.map((s) => ({ agreementId: id, ...s })));
		return row;
	});

	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: a.leaseId,
		action: 'agreement_sent',
		summary: `Sent “${a.title}” for signature`,
		data: { agreementId: id }
	});
	void notifyAgreementSent(ctx.orgId, sent, signers).catch((err) =>
		console.error('agreement email failed', err)
	);
	return { ...sent, unreachable: signers.filter((s) => !s.email).map((s) => s.name) };
}

export async function voidAgreement(ctx: OrgContext, id: string) {
	const [a] = await db
		.update(leaseAgreement)
		.set({ status: 'void' })
		.where(
			and(
				eq(leaseAgreement.organizationId, ctx.orgId),
				eq(leaseAgreement.id, id),
				eq(leaseAgreement.status, 'sent')
			)
		)
		.returning();
	if (!a) error(409, 'Only agreements waiting for signatures can be voided');
	await emit({
		orgId: ctx.orgId,
		actorId: ctx.userId,
		entityType: 'lease',
		entityId: a.leaseId,
		action: 'agreement_voided',
		summary: `Voided “${a.title}”`,
		data: { agreementId: id }
	});
	return a;
}

/** Agreements a portal user can see: sent or signed, where one of their tenant records signs. */
export async function portalAgreements(tenantIds: string[]) {
	if (!tenantIds.length) return [];
	const rows = await db
		.selectDistinct({ a: leaseAgreement })
		.from(leaseAgreement)
		.innerJoin(agreementSigner, eq(agreementSigner.agreementId, leaseAgreement.id))
		.where(
			and(
				inArray(agreementSigner.tenantId, tenantIds),
				inArray(leaseAgreement.status, ['sent', 'signed'])
			)
		)
		.orderBy(desc(leaseAgreement.createdAt));
	const signers = await signersOf(rows.map((r) => r.a.id));
	return rows.map(({ a }) => {
		const mine = signers.filter((s) => s.agreementId === a.id);
		return {
			id: a.id,
			leaseId: a.leaseId,
			title: a.title,
			status: a.status,
			body: a.status === 'sent' ? a.body : null,
			contentHash: a.contentHash!,
			sentAt: a.sentAt,
			completedAt: a.completedAt,
			needsMySignature: mine.some((s) => tenantIds.includes(s.tenantId) && !s.signedAt),
			signers: mine.map((s) => ({ name: s.name, signedAt: s.signedAt }))
		};
	});
}

export async function signAgreement(
	userId: string,
	input: { id: string; signedName: string; contentHash: string },
	meta: { ip: string | null; userAgent: string | null }
) {
	const tenantIds = (await portalTenants(userId)).map((t) => t.tenant.id);
	if (!tenantIds.length) error(403, 'No tenant account');

	const result = await db.transaction(async (tx) => {
		const [a] = await tx
			.select()
			.from(leaseAgreement)
			.where(eq(leaseAgreement.id, input.id))
			.for('update');
		if (!a) error(404, 'Agreement not found');
		if (a.status !== 'sent') error(409, 'This agreement is no longer open for signature');
		if (a.contentHash !== input.contentHash)
			error(409, 'The document changed. Reload the page and review it again.');

		const signed = await tx
			.update(agreementSigner)
			.set({
				signedName: input.signedName,
				signedAt: new Date(),
				signedByUserId: userId,
				ip: meta.ip,
				userAgent: meta.userAgent?.slice(0, 500) ?? null
			})
			.where(
				and(
					eq(agreementSigner.agreementId, a.id),
					inArray(agreementSigner.tenantId, tenantIds),
					isNull(agreementSigner.signedAt)
				)
			)
			.returning();
		if (!signed.length) error(409, 'You have already signed this agreement');

		const [{ left }] = (await tx
			.select({ left: sql<number>`count(*)::int` })
			.from(agreementSigner)
			.where(and(eq(agreementSigner.agreementId, a.id), isNull(agreementSigner.signedAt)))) as [
			{ left: number }
		];
		if (left > 0) return { agreement: a, completed: false };

		const completedAt = new Date();
		const [org] = await tx
			.select({ name: organization.name })
			.from(organization)
			.where(eq(organization.id, a.organizationId));
		const signers = await tx
			.select()
			.from(agreementSigner)
			.where(eq(agreementSigner.agreementId, a.id))
			.orderBy(asc(agreementSigner.name));
		const bytes = await agreementPdf({
			...a,
			orgName: org?.name ?? '',
			watermark: null,
			certificate: true,
			completedAt,
			signers
		});
		const storageKey = `${a.organizationId}/${randomUUID()}`;
		await store.put(storageKey, bytes);
		const [doc] = await tx
			.insert(document)
			.values({
				organizationId: a.organizationId,
				name: `${a.title} (signed).pdf`.slice(0, 200),
				contentType: 'application/pdf',
				size: bytes.length,
				storageKey,
				entityType: 'lease',
				entityId: a.leaseId
			})
			.returning();
		const [done] = await tx
			.update(leaseAgreement)
			.set({ status: 'signed', completedAt, documentId: doc!.id })
			.where(eq(leaseAgreement.id, a.id))
			.returning();
		return { agreement: done!, completed: true };
	});

	const a = result.agreement;
	await emit({
		orgId: a.organizationId,
		entityType: 'lease',
		entityId: a.leaseId,
		action: result.completed ? 'agreement_signed' : 'agreement_signature',
		summary: result.completed
			? `“${a.title}” signed by every tenant`
			: `${input.signedName} signed “${a.title}”`,
		data: { agreementId: a.id }
	});
	if (result.completed)
		void notifyAgreementSigned(a.organizationId, a).catch((err) =>
			console.error('agreement email failed', err)
		);
	return { completed: result.completed };
}

/**
 * PDF for staff of the agreement's workspace, or for a tenant who signs it.
 * Signed agreements return the stored file so the bytes never change.
 */
export async function agreementFile(
	id: string,
	access: { orgId: string | null; userId: string | null }
) {
	const [a] = await db.select().from(leaseAgreement).where(eq(leaseAgreement.id, id));
	if (!a) error(404, 'Agreement not found');
	let signers: (typeof agreementSigner.$inferSelect)[] | null = null;
	if (a.organizationId !== access.orgId) {
		const tenantIds = access.userId
			? (await portalTenants(access.userId)).map((t) => t.tenant.id)
			: [];
		signers = await signersOf([a.id]);
		const visible =
			(a.status === 'sent' || a.status === 'signed') &&
			signers.some((s) => tenantIds.includes(s.tenantId));
		if (!visible) error(404, 'Agreement not found');
	}
	const name = `${a.title}${a.status === 'signed' ? ' (signed)' : ''}.pdf`;
	if (a.status === 'signed' && a.documentId) {
		const [doc] = await db.select().from(document).where(eq(document.id, a.documentId));
		const data = doc && (await store.get(doc.storageKey));
		if (data) return { name, data };
	}
	const [org] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, a.organizationId));
	const data = await agreementPdf({
		...a,
		orgName: org?.name ?? '',
		watermark: WATERMARK[a.status],
		certificate: a.status === 'signed',
		signers: signers ?? (await signersOf([a.id]))
	});
	return { name, data };
}
