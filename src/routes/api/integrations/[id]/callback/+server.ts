import { error, isHttpError, redirect } from '@sveltejs/kit';
import { requireOrg } from '#lib/server/context.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import { appOrigin } from '#lib/server/email.ts';
import { getIntegration } from '#lib/server/integrations/runtime.ts';
import { completeOAuth, stateCookie } from '#lib/server/integrations/oauth.ts';
import { runSync } from '#lib/server/integrations/sync.ts';
import type { RequestHandler } from './$types';

const back = (id: string, query: Record<string, string>) =>
	`/settings/integrations?${new URLSearchParams({ integration: id, ...query })}`;

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	assertNotDemo();
	const def = getIntegration(params.id);
	if (!def?.oauth) error(404, 'Not found');
	const cookie = stateCookie(def.id);
	const nonce = cookies.get(cookie);
	cookies.delete(cookie, { path: `/api/integrations/${def.id}` });

	const denied = url.searchParams.get('error');
	if (denied)
		redirect(303, back(def.id, { error: denied === 'access_denied' ? 'denied' : 'failed' }));

	const ctx = await requireOrg('admin');
	try {
		await completeOAuth({ ...def, oauth: def.oauth }, url, nonce, ctx, appOrigin());
	} catch (err) {
		if (isHttpError(err)) redirect(303, back(def.id, { error: 'expired' }));
		console.error(`[integration:${def.id}] connection failed`, err);
		redirect(303, back(def.id, { error: 'failed' }));
	}
	void runSync(ctx.orgId, def.id).catch((err) =>
		console.error(`[integration:${def.id}] first sync failed`, err)
	);
	redirect(303, back(def.id, { connected: '1' }));
};
