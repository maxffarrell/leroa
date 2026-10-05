import * as v from 'valibot';
import { command, query } from '$app/server';
import { requireOrg, requireUser } from '#lib/server/context.ts';
import * as svc from '#lib/server/services/messaging.ts';
import { portalTenants } from '#lib/server/services/portal.ts';
import { announcementCreate, idSchema, messageSend } from '#lib/schemas.ts';

export const getThreads = query(async () => svc.listThreads((await requireOrg()).orgId));

export const getUnreadCount = query(async () => svc.unreadThreadCount((await requireOrg()).orgId));

export const getThread = query(idSchema, async (tenantId) =>
	svc.getThread((await requireOrg()).orgId, tenantId)
);

export const sendMessage = command(messageSend, async (input) => {
	const m = await svc.sendStaffMessage(await requireOrg(), input);
	void getThread(input.tenantId).refresh();
	void getThreads().refresh();
	return m;
});

export const getAnnouncements = query(async () =>
	svc.listAnnouncements((await requireOrg()).orgId)
);

export const getAudience = query(v.nullable(idSchema), async (propertyId) =>
	svc.announcementAudience((await requireOrg()).orgId, propertyId)
);

export const sendAnnouncement = command(announcementCreate, async (input) => {
	const a = await svc.createAnnouncement(await requireOrg(), input);
	void getAnnouncements().refresh();
	return a;
});

export const deleteAnnouncement = command(idSchema, async (id) => {
	await svc.deleteAnnouncement(await requireOrg(), id);
	void getAnnouncements().refresh();
});

export const getPortalMessages = query(async () => svc.portalMessages(requireUser().user.id));

export const sendPortalMessage = command(messageSend, async (input) => {
	const m = await svc.sendPortalMessage(requireUser().user.id, input);
	void getPortalMessages().refresh();
	return m;
});

export const getPortalAnnouncements = query(async () => {
	const tenants = await portalTenants(requireUser().user.id);
	return svc.portalAnnouncements(tenants.map((t) => t.tenant.id));
});
