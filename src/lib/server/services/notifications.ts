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
	leaseExpiryAlerts: true,
	newApplications: true,
	newLeads: true
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
			leaseExpiryAlerts: s.leaseExpiryAlerts,
			newApplications: s.newApplications,
			newLeads: s.newLeads
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

/** Asks each signer to review and sign a lease agreement in the portal. */
export async function notifyAgreementSent(
	orgId: string,
	agreement: { id: string; title: string },
	signers: { name: string; email: string | null }[]
) {
	const org = await orgName(orgId);
	for (const s of signers) {
		if (!s.email) continue;
		await notifyOnce(orgId, 'agreement.sent', agreement.id, {
			to: s.email,
			subject: `Please sign: ${agreement.title}`,
			...renderEmail({
				orgName: org,
				heading: 'Your lease is ready to sign',
				lines: [
					`Hi ${s.name.split(' ')[0] || 'there'},`,
					`${org} sent you “${agreement.title}” to review and sign.`
				],
				action: { label: 'Review and sign', url: `${appOrigin()}/portal` }
			})
		});
	}
}

/** Tells owners and admins that every tenant has signed. */
export async function notifyAgreementSigned(
	orgId: string,
	agreement: { id: string; title: string; leaseId: string }
) {
	const org = await orgName(orgId);
	for (const to of await managerEmails(orgId)) {
		await notifyOnce(orgId, 'agreement.signed', agreement.id, {
			to,
			subject: `Signed: ${agreement.title}`,
			...renderEmail({
				orgName: org,
				heading: 'Lease signed',
				lines: [`Every tenant has signed “${agreement.title}”. The signed PDF is on the lease.`],
				action: { label: 'Open lease', url: `${appOrigin()}/leases/${agreement.leaseId}` }
			})
		});
	}
}

type ApplicationRef = { id: string; firstName: string; lastName: string; email: string };

/** Confirms to the applicant that their application arrived. */
export async function notifyApplicationReceived(
	orgId: string,
	app: ApplicationRef,
	listingTitle: string
) {
	const org = await orgName(orgId);
	await notifyOnce(orgId, 'application.received', app.id, {
		to: app.email,
		subject: `We received your application: ${listingTitle}`,
		...renderEmail({
			orgName: org,
			heading: 'Application received',
			lines: [
				`Hi ${app.firstName},`,
				`Thanks for applying for “${listingTitle}”. ${org} will review your application and contact you at this address.`
			]
		})
	});
}

/** Tells owners and admins about a new application from a public listing. */
export async function notifyNewApplication(
	orgId: string,
	app: ApplicationRef,
	listingTitle: string
) {
	if (!(await getNotificationPrefs(orgId)).newApplications) return;
	const org = await orgName(orgId);
	for (const to of await managerEmails(orgId)) {
		await notifyOnce(orgId, 'application.submitted', app.id, {
			to,
			subject: `New application: ${listingTitle}`,
			...renderEmail({
				orgName: org,
				heading: 'New rental application',
				lines: [`${app.firstName} ${app.lastName} applied for “${listingTitle}”.`],
				action: {
					label: 'Review application',
					url: `${appOrigin()}/leasing/applications/${app.id}`
				}
			})
		});
	}
}

/** Sends a vendor their work-order link. Not deduplicated: staff may resend on purpose. */
export async function notifyWorkOrder(
	orgId: string,
	t: { number: number; title: string; priority: string; dueDate: string | null },
	to: { name: string; email: string },
	place: string,
	path: string
) {
	const org = await orgName(orgId);
	return sendEmail({
		to: to.email,
		subject: `Work order #${t.number} from ${org}: ${t.title}`,
		...renderEmail({
			orgName: org,
			heading: `Work order #${t.number}`,
			lines: [
				`Hi ${to.name},`,
				`${org} has a job for you at ${place}: “${t.title}”.`,
				...(t.priority === 'urgent' || t.priority === 'high' ? [`Priority: ${t.priority}.`] : []),
				...(t.dueDate ? [`Needed by ${formatDate(t.dueDate)}.`] : []),
				'Use the link to see the details and photos, post updates, and mark the job done. No account needed.'
			],
			action: { label: 'Open work order', url: `${appOrigin()}${path}` }
		})
	});
}

/** Tells owners and admins what a vendor did from their work-order link. */
export async function notifyVendorUpdate(
	t: TicketRef,
	vendorName: string,
	changes: string[],
	note: string | null,
	key: string
) {
	if (!(await getNotificationPrefs(t.organizationId)).maintenanceUpdates) return;
	const org = await orgName(t.organizationId);
	for (const to of await managerEmails(t.organizationId)) {
		await notifyOnce(t.organizationId, 'ticket.vendor_update', key, {
			to,
			subject: `#${t.number} ${t.title}: ${vendorName} ${changes.join(', ')}`,
			...renderEmail({
				orgName: org,
				heading: `${vendorName} updated #${t.number}`,
				lines: [
					`${vendorName} ${changes.join(', ')} on “${t.title}”.`,
					...(note ? [`“${note}”`] : [])
				],
				action: {
					label: 'Open request',
					url: `${appOrigin()}/maintenance?ticket=${t.id}`
				}
			})
		});
	}
}

/** Asks residents to review a completed move-in or move-out report in the portal. */
export async function notifyInspectionReady(
	orgId: string,
	i: { id: string; kind: 'move_in' | 'move_out' | 'routine' },
	residents: { name: string; email: string | null }[]
) {
	const org = await orgName(orgId);
	const what = i.kind === 'move_in' ? 'move-in' : 'move-out';
	for (const r of residents) {
		if (!r.email) continue;
		await notifyOnce(orgId, 'inspection.ready', i.id, {
			to: r.email,
			subject: `Your ${what} inspection report is ready`,
			...renderEmail({
				orgName: org,
				heading: `Review your ${what} inspection`,
				lines: [
					`Hi ${r.name.split(' ')[0] || 'there'},`,
					`${org} finished the ${what} inspection of your home. Please review the report and let them know if anything looks wrong.`
				],
				action: { label: 'Review report', url: `${appOrigin()}/portal` }
			})
		});
	}
}

/** Tells owners and admins that a resident reviewed an inspection report. */
export async function notifyInspectionAcknowledged(
	orgId: string,
	i: { id: string; tenantComment: string | null }
) {
	const org = await orgName(orgId);
	for (const to of await managerEmails(orgId)) {
		await notifyOnce(orgId, 'inspection.acknowledged', i.id, {
			to,
			subject: i.tenantComment
				? 'A resident commented on an inspection report'
				: 'A resident reviewed an inspection report',
			...renderEmail({
				orgName: org,
				heading: 'Inspection report reviewed',
				lines: i.tenantComment
					? ['The resident reviewed the report and left comments:', `“${i.tenantComment}”`]
					: ['The resident reviewed the report with no comments.'],
				action: { label: 'Open inspection', url: `${appOrigin()}/inspections/${i.id}` }
			})
		});
	}
}

const paragraphs = (body: string) =>
	body
		.replace(/\r\n?/g, '\n')
		.split(/\n+/)
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(0, 40);

/** Emails a resident when the management team sends them a message. */
export async function notifyResidentMessage(
	orgId: string,
	m: { id: string; body: string },
	r: { name: string; email: string | null }
) {
	if (!r.email) return;
	const org = await orgName(orgId);
	await notifyOnce(orgId, 'message.created', m.id, {
		to: r.email,
		subject: `New message from ${org}`,
		...renderEmail({
			orgName: org,
			heading: `New message from ${org}`,
			lines: [`Hi ${r.name.split(' ')[0] || 'there'},`, ...paragraphs(m.body)],
			action: { label: 'Reply in the resident portal', url: `${appOrigin()}/portal#messages` }
		})
	});
}

/** Emails owners and admins when a resident sends a message. */
export async function notifyStaffMessage(
	orgId: string,
	m: { id: string; body: string },
	from: { tenantId: string; name: string }
) {
	const org = await orgName(orgId);
	for (const to of await managerEmails(orgId)) {
		await notifyOnce(orgId, 'message.created', m.id, {
			to,
			subject: `New message from ${from.name}`,
			...renderEmail({
				orgName: org,
				heading: `${from.name} sent a message`,
				lines: paragraphs(m.body),
				action: { label: 'Reply', url: `${appOrigin()}/messages/${from.tenantId}` }
			})
		});
	}
}

/** Emails an announcement to each resident with an email address. */
export async function notifyAnnouncement(
	orgId: string,
	a: { id: string; subject: string; body: string },
	residents: { name: string; email: string | null }[]
) {
	const org = await orgName(orgId);
	let sent = 0;
	for (const r of residents) {
		if (!r.email) continue;
		const ok = await notifyOnce(orgId, 'announcement.sent', a.id, {
			to: r.email,
			subject: a.subject,
			...renderEmail({
				orgName: org,
				heading: a.subject,
				lines: [`Hi ${r.name.split(' ')[0] || 'there'},`, ...paragraphs(a.body)],
				action: { label: 'Open the resident portal', url: `${appOrigin()}/portal` }
			})
		});
		if (ok) sent++;
	}
	return sent;
}

type LeadRef = { id: string; firstName: string; lastName: string; email: string | null };

/** Tells owners and admins about an inquiry, waitlist sign-up or tour booked from a public page. */
export async function notifyLeadActivity(
	orgId: string,
	key: string,
	lead: LeadRef,
	subject: string,
	line: string
) {
	if (!(await getNotificationPrefs(orgId)).newLeads) return;
	const org = await orgName(orgId);
	for (const to of await managerEmails(orgId)) {
		await notifyOnce(orgId, 'lead.activity', key, {
			to,
			subject,
			...renderEmail({
				orgName: org,
				heading: subject,
				lines: [line],
				action: { label: 'Open lead', url: `${appOrigin()}/leasing/leads/${lead.id}` }
			})
		});
	}
}

/** Confirms a self-booked tour to the prospect. */
export async function notifyTourConfirmed(
	orgId: string,
	tourId: string,
	lead: LeadRef & { email: string },
	when: string,
	place: string
) {
	const org = await orgName(orgId);
	await notifyOnce(orgId, 'tour.confirmed', tourId, {
		to: lead.email,
		subject: `Tour booked: ${place}, ${when}`,
		...renderEmail({
			orgName: org,
			heading: 'Your tour is booked',
			lines: [
				`Hi ${lead.firstName},`,
				`You're booked to tour ${place} on ${when}.`,
				`If you need to change the time, reply to this email or contact ${org}.`
			]
		})
	});
}

/** Tells a waitlisted lead that a matching home was listed. Sent once per lead and listing. */
export async function notifyWaitlistOpening(
	orgId: string,
	listingId: string,
	lead: LeadRef & { email: string },
	listingTitle: string,
	url: string
) {
	const org = await orgName(orgId);
	return notifyOnce(orgId, 'waitlist.opening', listingId, {
		to: lead.email,
		subject: `Now available: ${listingTitle}`,
		...renderEmail({
			orgName: org,
			heading: 'A home you were waiting for is available',
			lines: [
				`Hi ${lead.firstName},`,
				`You joined the waitlist with ${org}. “${listingTitle}” is now available.`
			],
			action: { label: 'See the home and apply', url }
		})
	});
}
