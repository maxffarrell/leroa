import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { member, user, workflow } from '#lib/server/db/schema.ts';
import { appOrigin, sendEmail } from '#lib/server/email.ts';
import { renderEmail } from '#lib/server/email-template.ts';
import { orgBrand } from '#lib/server/branding.ts';
import * as v from 'valibot';
import type { OrgContext } from '#lib/server/context.ts';
import type { workflowInput, workflowUpdate } from '#lib/schemas.ts';
import type { LeroaEvent } from '#lib/server/services/events.ts';
import { inboxForManagers } from '#lib/server/services/inbox.ts';
import { createTicket } from '#lib/server/services/maintenance.ts';
import { error } from '@sveltejs/kit';

type Out<T extends v.GenericSchema> = v.InferOutput<T>;

export async function listWorkflows(orgId: string) {
	return db
		.select()
		.from(workflow)
		.where(eq(workflow.organizationId, orgId))
		.orderBy(desc(workflow.createdAt));
}

export async function createWorkflow(ctx: OrgContext, input: Out<typeof workflowInput>) {
	const [row] = await db
		.insert(workflow)
		.values({ ...input, organizationId: ctx.orgId })
		.returning();
	return row!;
}

export async function updateWorkflow(ctx: OrgContext, { id, ...data }: Out<typeof workflowUpdate>) {
	const [row] = await db
		.update(workflow)
		.set(data)
		.where(and(eq(workflow.organizationId, ctx.orgId), eq(workflow.id, id)))
		.returning();
	if (!row) error(404, 'Rule not found');
	return row;
}

export async function deleteWorkflow(orgId: string, id: string) {
	const [row] = await db
		.delete(workflow)
		.where(and(eq(workflow.organizationId, orgId), eq(workflow.id, id)))
		.returning({ id: workflow.id });
	if (!row) error(404, 'Rule not found');
}

const ENTITY_HREFS: Record<string, (id: string) => string> = {
	maintenance: (id) => `/maintenance?ticket=${id}`,
	lease: (id) => `/leases/${id}`,
	lead: (id) => `/leasing/leads/${id}`,
	application: (id) => `/leasing/applications/${id}`,
	property: (id) => `/properties/${id}`,
	tenant: (id) => `/tenants/${id}`,
	vendor: (id) => `/vendors/${id}`,
	owner: (id) => `/owners/${id}`,
	inspection: (id) => `/inspections/${id}`
};

const render = (template: string, event: LeroaEvent) =>
	template.replaceAll('{summary}', event.summary).replaceAll('{event}', event.type);

async function managerEmails(orgId: string) {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, orgId), inArray(member.role, ['owner', 'admin'])));
	return rows.map((r) => r.email);
}

/** Runs every enabled rule matching the event; called from emit() (fire-and-forget). */
export async function runWorkflows(event: LeroaEvent) {
	const rules = await db
		.select()
		.from(workflow)
		.where(and(eq(workflow.organizationId, event.organizationId), eq(workflow.enabled, true)));
	const matched = rules.filter((r) => r.eventType === '*' || r.eventType === event.type);
	for (const rule of matched) {
		try {
			if (rule.action === 'notify') {
				const body = rule.config.message ? render(rule.config.message, event) : event.summary;
				const href = ENTITY_HREFS[event.entity.type]?.(event.entity.id);
				await inboxForManagers(event.organizationId, `workflow.${rule.id}`, event.entity.id, {
					title: rule.name,
					body,
					href
				});
				const org = await orgBrand(event.organizationId);
				for (const to of await managerEmails(event.organizationId)) {
					await sendEmail({
						to,
						subject: `${rule.name}: ${event.summary}`,
						...renderEmail({
							orgName: org.name,
							accent: org.accent,
							heading: `Workflow: ${rule.name}`,
							lines: [body, `Event: ${event.type}`],
							action: href ? { label: 'Open in Leroa', url: `${appOrigin()}${href}` } : undefined
						})
					});
				}
			} else if (rule.action === 'create_ticket') {
				// Trusted causality survives async dispatch; generated events still run notify actions.
				if (event.data.workflowCreated === true) continue;
				const propertyId =
					(event.data.propertyId as string | undefined) ?? rule.config.propertyId ?? null;
				if (!propertyId) continue; // nothing to attach the ticket to
				await createTicket(
					{ orgId: event.organizationId, userId: null, workflowCreated: true },
					{
						propertyId,
						title: rule.config.title ? render(rule.config.title, event) : event.summary,
						priority:
							(rule.config.priority as 'low' | 'normal' | 'high' | 'urgent' | undefined) ??
							'normal',
						status: 'open'
					}
				);
			}
			await db
				.update(workflow)
				.set({ lastRunAt: new Date(), runCount: rule.runCount + 1 })
				.where(eq(workflow.id, rule.id));
		} catch (err) {
			console.error(`workflow ${rule.id} (${rule.name}) failed`, err);
			continue;
		}
	}
}
