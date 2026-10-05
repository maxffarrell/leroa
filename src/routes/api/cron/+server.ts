import { timingSafeEqual } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import { CRON_SECRET } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import { organization } from '#lib/server/db/schema.ts';
import { runRentAutomation } from '#lib/server/services/leasing.ts';
import { sendRentNotifications } from '#lib/server/services/notifications.ts';
import type { RequestHandler } from './$types';

const authorized = (header: string | null) => {
	if (!CRON_SECRET || !header) return false;
	const a = Buffer.from(header);
	const b = Buffer.from(`Bearer ${CRON_SECRET}`);
	return a.length === b.length && timingSafeEqual(a, b);
};

/** Daily job: posts rent and late fees and sends reminders for every workspace. */
export const GET: RequestHandler = async ({ request }) => {
	if (!authorized(request.headers.get('authorization'))) error(401, 'Unauthorized');
	const orgs = await db.select({ id: organization.id }).from(organization);
	let failed = 0;
	let emails = 0;
	for (const o of orgs) {
		try {
			await runRentAutomation(o.id, true);
			emails += (await sendRentNotifications(o.id)) ?? 0;
		} catch (err) {
			failed++;
			console.error(`cron failed for ${o.id}`, err);
		}
	}
	return json({ workspaces: orgs.length, failed, emails });
};

export const POST = GET;
