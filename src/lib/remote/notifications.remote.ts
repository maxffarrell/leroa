import { eq } from 'drizzle-orm';
import { command, query } from '$app/server';
import { requireOrg } from '#lib/server/context.ts';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import { cronEnabled, emailProvider, sendEmail } from '#lib/server/email.ts';
import { renderEmail } from '#lib/server/email-template.ts';
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
