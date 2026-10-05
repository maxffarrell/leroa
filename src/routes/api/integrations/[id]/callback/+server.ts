import { error, isHttpError, redirect } from '@sveltejs/kit';
import { requireOrg } from '#lib/server/context.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import { appOrigin } from '#lib/server/email.ts';
import { getIntegration } from '#lib/server/integrations/runtime.ts';
import { completeOAuth, stateCookie } from '#lib/server/integrations/oauth.ts';
import { runSync } from '#lib/server/integrations/sync.ts';
import type { RequestHandler } from './$types';

type Result = 'connected' | 'denied' | 'expired' | 'failed';

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	assertNotDemo();
	const def = getIntegration(params.id);
	if (!def?.oauth) error(404, 'Not found');
	const cookie = stateCookie(def.id);
	const nonce = cookies.get(cookie);
	cookies.delete(cookie, { path: `/api/integrations/${def.id}` });

	// The settings page reads this once to toast the result and reopen the integration.
	const back = (result: Result) => {
		cookies.set('leroa_integration_result', `${def.id}:${result}`, {
			path: '/settings/integrations',
			httpOnly: false,
			sameSite: 'lax',
			secure: appOrigin().startsWith('https:'),
			maxAge: 60
		});
		return '/settings/integrations';
	};

	const denied = url.searchParams.get('error');
	if (denied) redirect(303, back(denied === 'access_denied' ? 'denied' : 'failed'));

	const ctx = await requireOrg('admin');
	try {
		await completeOAuth({ ...def, oauth: def.oauth }, url, nonce, ctx, appOrigin());
	} catch (err) {
		if (isHttpError(err)) redirect(303, back('expired'));
		console.error(`[integration:${def.id}] connection failed`, err);
		redirect(303, back('failed'));
	}
	void runSync(ctx.orgId, def.id).catch((err) =>
		console.error(`[integration:${def.id}] first sync failed`, err)
	);
	redirect(303, back('connected'));
};
