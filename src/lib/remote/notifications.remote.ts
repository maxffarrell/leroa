import { eq } from 'drizzle-orm';
import { command, query } from '$app/server';
import * as v from 'valibot';
import { requireOrg } from '#lib/server/context.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import { cronEnabled, emailProvider, sendEmail } from '#lib/server/email.ts';
import { renderEmail } from '#lib/server/email-template.ts';
import {
	listInbox,
	markAllInboxRead,
	markInboxRead as markItemsRead
} from '#lib/server/services/inbox.ts';
import { getNotificationPrefs, saveNotificationPrefs } from '#lib/server/services/notifications.ts';
import { notificationSettingsInput } from '#lib/schemas.ts';

export const getNotificationSettings = query(async () => {
	const { orgId } = await requireOrg();
	return {
		prefs: await getNotificationPrefs(orgId),
		provider: emailProvider(),
		cron: cronEnabled()
	};
});

export const saveNotificationSettings = command(notificationSettingsInput, async (prefs) => {
	const { orgId } = await requireOrg('admin');
	await saveNotificationPrefs(orgId, prefs);
	void getNotificationSettings().refresh();
});

export const getInbox = query(async () => {
	const { orgId, userId } = await requireOrg();
	return listInbox(orgId, userId);
});

export const markInboxRead = command(
	v.object({ ids: v.array(v.pipe(v.string(), v.minLength(1))), all: v.optional(v.boolean()) }),
	async ({ ids, all }) => {
		const { orgId, userId } = await requireOrg();
		if (all) await markAllInboxRead(orgId, userId);
		else await markItemsRead(orgId, userId, ids);
		void getInbox().refresh();
	}
);

export const sendTestEmail = command(async () => {
	assertNotDemo();
	const ctx = await requireOrg('admin');
	const [me] = await db.select({ email: user.email }).from(user).where(eq(user.id, ctx.userId));
	if (!me) return { to: null };
	await sendEmail({
		to: me.email,
		subject: 'Leroa test email',
		...renderEmail({
			orgName: ctx.org.name,
			heading: 'Email is working',
			lines: ['This is a test message from your Leroa workspace.']
		})
	});
	return { to: me.email };
});
