import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db } from '#lib/server/db/index.ts';
import {
	charge,
	lease,
	leaseClause,
	leaseCriticalDate,
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
	user,
	vendor
} from '#lib/server/db/schema.ts';
import { appOrigin, sendEmail, type Email } from '#lib/server/email.ts';
import { inboxForManagers } from '#lib/server/services/inbox.ts';
import { renderEmail } from '#lib/server/email-template.ts';
import type { notificationSettingsInput } from '#lib/schemas.ts';
import { addDays, formatDate, formatMoney, todayISO } from '#lib/format.ts';
import { hasFeature } from '#lib/server/ee/license.ts';
import { INSURANCE_WARNING_DAYS, insuranceState } from '#lib/vendors.ts';

export type NotificationPrefs = v.InferOutput<typeof notificationSettingsInput>;

export const NOTIFICATION_DEFAULTS: NotificationPrefs = {
	rentReminders: true,
	reminderDaysBefore: 3,
	overdueNotices: true,
	maintenanceUpdates: true,
	leaseExpiryAlerts: true,
	vendorInsuranceAlerts: true,
	newApplications: true,
	newLeads: true,
	aiDigest: true
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
			vendorInsuranceAlerts: s.vendorInsuranceAlerts,
			newApplications: s.newApplications,
			newLeads: s.newLeads,
			aiDigest: s.aiDigest
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
				await inboxForManagers(orgId, 'lease.expiring', l.id, {
					title: `Lease ending ${formatDate(l.endDate)}`,
					body: `${l.propertyName} · ${l.unitName} hasn't been renewed yet.`,
					href: `/leases/${l.id}`
				});
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

/**
 * Daily check on vendor insurance certificates: one alert when a certificate
 * enters the 30-day window, another if it lapses.
 * Re-alerts if the date on file changes.
 */
export async function sendVendorInsuranceAlerts(orgId: string) {
	if (!(await getNotificationPrefs(orgId)).vendorInsuranceAlerts) return 0;
	const today = todayISO();
	const rows = await db
		.select({
			id: vendor.id,
			name: vendor.name,
			insuranceExpiresOn: vendor.insuranceExpiresOn
		})
		.from(vendor)
		.where(
			and(
				eq(vendor.organizationId, orgId),
				isNotNull(vendor.insuranceExpiresOn),
				isNull(vendor.archivedAt),
				lte(vendor.insuranceExpiresOn, addDays(today, INSURANCE_WARNING_DAYS))
			)
		);
	if (!rows.length) return 0;
	const org = await orgName(orgId);
	const managers = await managerEmails(orgId);
	let sent = 0;
	for (const v of rows) {
		const state = insuranceState(v.insuranceExpiresOn, today);
		if (state !== 'expiring' && state !== 'expired') continue;
		const expired = state === 'expired';
		await inboxForManagers(
			orgId,
			expired ? 'vendor.coi.expired' : 'vendor.coi.expiring',
			`${v.id}:${v.insuranceExpiresOn}`,
			{
				title: expired
					? `Vendor insurance lapsed: ${v.name}`
					: `Vendor insurance expires ${formatDate(v.insuranceExpiresOn)}: ${v.name}`,
				href: '/vendors'
			}
		);
		for (const to of managers) {
			const ok = await notifyOnce(
				orgId,
				expired ? 'vendor.coi.expired' : 'vendor.coi.expiring',
				`${v.id}:${v.insuranceExpiresOn}`,
				{
					to,
					subject: expired
						? `Vendor insurance lapsed: ${v.name}`
						: `Vendor insurance expires ${formatDate(v.insuranceExpiresOn)}: ${v.name}`,
					...renderEmail({
						orgName: org,
						heading: expired ? 'A vendor’s insurance has lapsed' : 'Vendor insurance expiring',
						lines: expired
							? [
									`${v.name}’s certificate of insurance expired on ${formatDate(v.insuranceExpiresOn)}.`,
									'Get a current certificate before sending them more work orders.'
								]
							: [
									`${v.name}’s certificate of insurance expires on ${formatDate(v.insuranceExpiresOn)}.`,
									'Ask them for a renewal before it lapses.'
								],
						action: { label: 'Open vendors', url: `${appOrigin()}/vendors` }
					})
				}
			);
			if (ok) sent++;
		}
	}
	return sent;
}

/** Daily reminder for open lease critical dates inside their remind window (commercial leases). */
export async function sendCriticalDateAlerts(orgId: string): Promise<number> {
	const rows = await db
		.select({
			id: leaseCriticalDate.id,
			label: leaseCriticalDate.label,
			date: leaseCriticalDate.date,
			leaseId: leaseCriticalDate.leaseId,
			clauseTitle: leaseClause.title,
			unitName: unit.name,
			propertyName: property.name
		})
		.from(leaseCriticalDate)
		.innerJoin(lease, eq(lease.id, leaseCriticalDate.leaseId))
		.innerJoin(unit, eq(unit.id, lease.unitId))
		.innerJoin(property, eq(property.id, unit.propertyId))
		.leftJoin(leaseClause, eq(leaseClause.id, leaseCriticalDate.clauseId))
		.where(
			and(
				eq(leaseCriticalDate.organizationId, orgId),
				isNull(leaseCriticalDate.doneAt),
				sql`${leaseCriticalDate.date} <= current_date + ${leaseCriticalDate.remindDays}`
			)
		);
	if (!rows.length) return 0;
	const org = await orgName(orgId);
	const managers = await managerEmails(orgId);
	const today = todayISO();
	let sent = 0;
	for (const d of rows) {
		const due = d.date <= today;
		const kind = due ? 'lease.critical_date.due' : 'lease.critical_date';
		const where = `${d.propertyName} · ${d.unitName}`;
		await inboxForManagers(orgId, kind, `${d.id}:${d.date}`, {
			title: due
				? `Critical date due: ${d.label}`
				: `Critical date ${formatDate(d.date)}: ${d.label}`,
			body: `${where}${d.clauseTitle ? ` · ${d.clauseTitle}` : ''}`,
			href: `/leases/${d.leaseId}`
		});
		for (const to of managers) {
			const ok = await notifyOnce(orgId, kind, `${d.id}:${d.date}`, {
				to,
				subject: `${due ? 'Critical date due' : 'Lease critical date'} ${formatDate(d.date)}: ${d.label}`,
				...renderEmail({
					orgName: org,
					heading: due ? 'A lease critical date is due' : 'A lease critical date is coming up',
					lines: [
						`${d.label} — ${formatDate(d.date)}.`,
						`${where}${d.clauseTitle ? ` · from clause "${d.clauseTitle}"` : ''}.`
					],
					action: { label: 'Open lease', url: `${appOrigin()}/leases/${d.leaseId}` }
				})
			});
			if (ok) sent++;
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
	await inboxForManagers(t.organizationId, 'ticket.created', t.id, {
		title: `New maintenance request #${t.number}`,
		body: `A tenant at ${place} reported: \u201c${t.title}\u201d.`,
		href: `/maintenance?ticket=${t.id}`
	});
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

/** Tells managers a new request triaged as a possible emergency. Emergencies skip pref checks. */
export async function notifyTicketEmergency(t: TicketRef, place: string, reason: string | null) {
	const org = await orgName(t.organizationId);
	await inboxForManagers(t.organizationId, 'ticket.emergency', t.id, {
		title: `Possible emergency: #${t.number} ${t.title}`,
		body: `${place}${reason ? ` — ${reason}` : ''}`,
		href: `/maintenance?ticket=${t.id}`
	});
	for (const to of await managerEmails(t.organizationId)) {
		await notifyOnce(t.organizationId, 'ticket.emergency', t.id, {
			to,
			subject: `Possible emergency at ${place}: #${t.number} ${t.title}`,
			...renderEmail({
				orgName: org,
				heading: 'A request reads like an emergency',
				lines: [
					`“${t.title}” was reported at ${place} and triaged as a possible emergency.`,
					...(reason ? [reason] : []),
					'It was moved to urgent priority.'
				],
				action: {
					label: 'Open request',
					url: `${appOrigin()}/maintenance?ticket=${t.id}`
				}
			})
		});
	}
}

/** Tells managers a resident's message matched emergency wording. */
export async function notifyUrgentMessage(
	orgId: string,
	messageId: string,
	tenantName: string,
	tenantId: string,
	excerpt: string
) {
	const org = await orgName(orgId);
	await inboxForManagers(orgId, 'message.urgent', messageId, {
		title: `Urgent-sounding message from ${tenantName}`,
		body: `“${excerpt}”`,
		href: `/messages/${tenantId}`
	});
	for (const to of await managerEmails(orgId)) {
		await notifyOnce(orgId, 'message.urgent', messageId, {
			to,
			subject: `Urgent-sounding message from ${tenantName}`,
			...renderEmail({
				orgName: org,
				heading: 'A resident message may be urgent',
				lines: [
					`${tenantName} wrote: “${excerpt}”`,
					'It matched emergency wording — worth a quick look.'
				],
				action: { label: 'Open messages', url: `${appOrigin()}/messages/${tenantId}` }
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
	await inboxForManagers(orgId, 'agreement.signed', agreement.id, {
		title: `Signed: ${agreement.title}`,
		body: 'Every tenant has signed. The signed PDF is on the lease.',
		href: `/leases/${agreement.leaseId}`
	});
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
	await inboxForManagers(orgId, 'application.submitted', app.id, {
		title: `New application: ${listingTitle}`,
		body: `${app.firstName} ${app.lastName} applied.`,
		href: `/leasing/applications/${app.id}`
	});
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
	await inboxForManagers(t.organizationId, 'ticket.vendor_update', key, {
		title: `#${t.number} ${t.title}: ${vendorName} ${changes.join(', ')}`,
		body: note ?? undefined,
		href: `/maintenance?ticket=${t.id}`
	});
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
	await inboxForManagers(orgId, 'inspection.acknowledged', i.id, {
		title: i.tenantComment
			? 'A resident commented on an inspection report'
			: 'A resident reviewed an inspection report',
		body: i.tenantComment ?? undefined,
		href: `/inspections/${i.id}`
	});
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
	await inboxForManagers(orgId, 'message.created', m.id, {
		title: `New message from ${from.name}`,
		body: paragraphs(m.body)[0],
		href: `/messages/${from.tenantId}`
	});
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
	await inboxForManagers(orgId, 'lead.activity', key, {
		title: subject,
		body: line,
		href: `/leasing/leads/${lead.id}`
	});
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

/** AI morning digest: yesterday's activity and upcoming deadlines, for owners/admins (enterprise). */
export async function sendAiDigest(orgId: string): Promise<number> {
	if (!hasFeature('ai')) return 0;
	const prefs = await getNotificationPrefs(orgId);
	if (!prefs.aiDigest) return 0;
	const org = await orgName(orgId);
	const managers = await managerEmails(orgId);
	if (!managers.length) return 0;
	const { digestFacts, digestEmail } = await import('#lib/server/ai/index.ts');
	const facts = await digestFacts(orgId, org);
	const mail = await digestEmail(facts);
	const day = todayISO();
	let sent = 0;
	for (const to of managers) {
		const ok = await notifyOnce(orgId, 'ai.digest', day, {
			to,
			subject: mail.subject,
			...renderEmail({
				orgName: org,
				heading: 'Your morning digest',
				lines: [mail.intro, ...mail.lines.map((l) => `• ${l}`)],
				action: { label: 'Open dashboard', url: `${appOrigin()}/` }
			})
		});
		if (ok) sent++;
	}
	return sent;
}
