import { and, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	lease,
	leaseTenant,
	maintenanceTicket,
	member,
	notificationLog,
	notificationSettings,
	organization,
	payment,
	property,
	tenant,
	unit,
	user
} from '#lib/server/db/schema.ts';
import { appOrigin, sendEmail, type Email } from '#lib/server/email.ts';
import { renderEmail } from '#lib/server/email-template.ts';
import type { notificationSettingsInput } from '#lib/schemas.ts';
import { addDays, formatDate, formatMoney, todayISO } from '#lib/format.ts';

export type NotificationPrefs = v.InferOutput<typeof notificationSettingsInput>;

export const NOTIFICATION_DEFAULTS: NotificationPrefs = {
	rentReminders: true,
	reminderDaysBefore: 3,
	overdueNotices: true,
	maintenanceUpdates: true,
	leaseExpiryAlerts: true
};

/** How long after the due date an overdue notice may still go out. */
const OVERDUE_WINDOW_DAYS = 30;
const LEASE_EXPIRY_WINDOW_DAYS = 60;

export async function getNotificationPrefs(orgId: string): Promise<NotificationPrefs> {
	const s = notificationSettings;
	const [row] = await db
		.select({
			rentReminders: s.rentReminders,
			reminderDaysBefore: s.reminderDaysBefore,
			overdueNotices: s.overdueNotices,
			maintenanceUpdates: s.maintenanceUpdates,
			leaseExpiryAlerts: s.leaseExpiryAlerts
		})
		.from(s)
		.where(eq(s.organizationId, orgId));
	return row ?? { ...NOTIFICATION_DEFAULTS };
}

export async function saveNotificationPrefs(orgId: string, prefs: NotificationPrefs) {
	await db
		.insert(notificationSettings)
		.values({ organizationId: orgId, ...prefs })
		.onConflictDoUpdate({ target: notificationSettings.organizationId, set: prefs });
}

/** Sends `email` unless this (kind, entity, recipient) was already notified. */
async function notifyOnce(
	orgId: string,
	kind: string,
	entityId: string,
	email: Email
): Promise<boolean> {
	const [row] = await db
		.insert(notificationLog)
		.values({ organizationId: orgId, kind, entityId, recipient: email.to.toLowerCase() })
		.onConflictDoNothing()
		.returning({ id: notificationLog.id });
	if (!row) return false;
	try {
		await sendEmail(email);
		return true;
	} catch (err) {
		await db.delete(notificationLog).where(eq(notificationLog.id, row.id));
		console.error(`email ${kind} failed`, err);
		return false;
	}
}

async function orgName(orgId: string) {
	const [o] = await db
		.select({ name: organization.name })
		.from(organization)
		.where(eq(organization.id, orgId));
	return o?.name ?? 'Your property manager';
}

async function managerEmails(orgId: string) {
	const rows = await db
		.select({ email: user.email })
		.from(member)
		.innerJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, orgId), inArray(member.role, ['owner', 'admin'])));
	return rows.map((r) => r.email);
}

const firstName = (t: { firstName: string; companyName: string | null }) =>
	t.firstName || t.companyName || 'there';

/** Rent reminders and overdue notices for tenants, and lease-expiry alerts for managers. */
export async function sendRentNotifications(orgId: string) {
	const prefs = await getNotificationPrefs(orgId);
	if (!prefs.rentReminders && !prefs.overdueNotices && !prefs.leaseExpiryAlerts) return;

	const today = todayISO();
	const org = await orgName(orgId);
	const origin = appOrigin();
	let sent = 0;

	if (prefs.rentReminders || prefs.overdueNotices) {
		const rows = await db
			.select({
				chargeId: charge.id,
				description: charge.description,
				dueDate: charge.dueDate,
				amount: charge.amount,
				paid: sql<number>`coalesce((select sum(p.amount) from ${payment} p where p.charge_id = ${charge.id}), 0)`.mapWith(
					Number
				),
				balance: sql<number>`(
					coalesce((select sum(c2.amount) from ${charge} c2 where c2.lease_id = ${lease.id} and c2.due_date <= current_date), 0)
					- coalesce((select sum(p2.amount) from ${payment} p2 where p2.lease_id = ${lease.id}), 0)
				)`.mapWith(Number),
				currency: lease.currency,
				email: tenant.email,
				firstName: tenant.firstName,
				companyName: tenant.companyName
			})
			.from(charge)
			.innerJoin(lease, eq(lease.id, charge.leaseId))
			.innerJoin(leaseTenant, eq(leaseTenant.leaseId, lease.id))
			.innerJoin(tenant, eq(tenant.id, leaseTenant.tenantId))
			.where(
				and(
					eq(charge.organizationId, orgId),
					eq(charge.kind, 'rent'),
					eq(lease.status, 'active'),
					isNotNull(tenant.email),
					gte(charge.dueDate, addDays(today, -OVERDUE_WINDOW_DAYS)),
					lte(charge.dueDate, addDays(today, prefs.reminderDaysBefore))
				)
			);

		for (const r of rows) {
			const open = r.amount - r.paid;
			const upcoming = r.dueDate >= today;
			// `balance` only counts charges already due, so add this one back when it's upcoming.
			const owed = r.balance + (r.dueDate > today ? open : 0);
			if (open <= 0 || owed <= 0 || !r.email) continue;
			const amount = formatMoney(Math.min(open, owed), r.currency);
			const what = r.description ?? 'Rent';
			const action = { label: 'View in tenant portal', url: `${origin}/portal` };
			if (upcoming && prefs.rentReminders) {
				const when = r.dueDate === today ? 'today' : `on ${formatDate(r.dueDate)}`;
				if (
					await notifyOnce(orgId, 'rent.reminder', r.chargeId, {
						to: r.email,
						subject: `${what}: ${amount} due ${when}`,
						...renderEmail({
							orgName: org,
							heading: 'Rent reminder',
							lines: [`Hi ${firstName(r)},`, `${what} of ${amount} is due ${when}.`],
							action
						})
					})
				)
					sent++;
			} else if (!upcoming && prefs.overdueNotices) {
				if (
					await notifyOnce(orgId, 'rent.overdue', r.chargeId, {
						to: r.email,
						subject: `${what} is overdue`,
						...renderEmail({
							orgName: org,
							heading: 'Your rent is overdue',
							lines: [
								`Hi ${firstName(r)},`,
								`${what} was due on ${formatDate(r.dueDate)} and ${amount} is still outstanding.`,
								'If you have already paid, please ignore this message.'
							],
							action
						})
					})
				)
					sent++;
			}
		}
	}

	if (prefs.leaseExpiryAlerts) {
		const expiring = await db
			.select({
				id: lease.id,
				endDate: lease.endDate,
				unitName: unit.name,
				propertyName: property.name
			})
			.from(lease)
			.innerJoin(unit, eq(unit.id, lease.unitId))
			.innerJoin(property, eq(property.id, unit.propertyId))
			.where(
				and(
					eq(lease.organizationId, orgId),
					eq(lease.status, 'active'),
					gte(lease.endDate, today),
					lte(lease.endDate, addDays(today, LEASE_EXPIRY_WINDOW_DAYS)),
					sql`not exists (select 1 from ${lease} r where r.renewed_from_id = ${lease.id} and r.status <> 'terminated')`
				)
			);
		if (expiring.length) {
			const managers = await managerEmails(orgId);
			for (const l of expiring) {
				for (const to of managers) {
					if (
						await notifyOnce(orgId, 'lease.expiring', l.id, {
							to,
							subject: `Lease ending ${formatDate(l.endDate)}: ${l.propertyName} · ${l.unitName}`,
							...renderEmail({
								orgName: org,
								heading: 'A lease is ending soon',
								lines: [
									`The lease for ${l.propertyName} · ${l.unitName} ends on ${formatDate(l.endDate)} and hasn't been renewed yet.`
								],
								action: { label: 'Review lease', url: `${origin}/leases/${l.id}` }
							})
						})
					)
						sent++;
				}
			}
		}
	}
	return sent;
}

type TicketRef = Pick<
	typeof maintenanceTicket.$inferSelect,
	'id' | 'organizationId' | 'number' | 'title' | 'status' | 'tenantId'
>;

const STATUS_COPY: Partial<Record<TicketRef['status'], string>> = {
	in_progress: 'is being worked on',
	done: 'has been completed',
	cancelled: 'has been closed'
};

/** Tells the tenant who reported a ticket that it moved along. */
export async function notifyTicketStatus(t: TicketRef) {
	const copy = STATUS_COPY[t.status];
	if (!t.tenantId || !copy) return;
	if (!(await getNotificationPrefs(t.organizationId)).maintenanceUpdates) return;
	const [who] = await db
		.select({ email: tenant.email, firstName: tenant.firstName, companyName: tenant.companyName })
		.from(tenant)
		.where(eq(tenant.id, t.tenantId));
	if (!who?.email) return;
	await notifyOnce(t.organizationId, `ticket.${t.status}`, t.id, {
		to: who.email,
		subject: `Request #${t.number} ${copy}`,
		...renderEmail({
			orgName: await orgName(t.organizationId),
			heading: `Your request ${copy}`,
			lines: [`Hi ${firstName(who)},`, `#${t.number} “${t.title}” ${copy}.`],
			action: { label: 'View in tenant portal', url: `${appOrigin()}/portal` }
		})
	});
}

/** Tells owners and admins about a request a tenant sent from the portal. */
export async function notifyPortalRequest(t: TicketRef, place: string) {
	if (!(await getNotificationPrefs(t.organizationId)).maintenanceUpdates) return;
	const org = await orgName(t.organizationId);
	for (const to of await managerEmails(t.organizationId)) {
		await notifyOnce(t.organizationId, 'ticket.created', t.id, {
			to,
			subject: `New maintenance request #${t.number}: ${t.title}`,
			...renderEmail({
				orgName: org,
				heading: 'New maintenance request',
				lines: [`A tenant at ${place} reported: “${t.title}”.`],
				action: { label: 'Open maintenance board', url: `${appOrigin()}/maintenance` }
			})
		});
	}
}
