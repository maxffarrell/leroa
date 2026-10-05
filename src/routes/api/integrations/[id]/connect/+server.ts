import { error, redirect } from '@sveltejs/kit';
import { requireOrg } from '#lib/server/context.ts';
import { assertNotDemo } from '#lib/server/demo-mode.ts';
import { appOrigin } from '#lib/server/email.ts';
import { getIntegration } from '#lib/server/integrations/runtime.ts';
import { startOAuth, stateCookie } from '#lib/server/integrations/oauth.ts';
import type { RequestHandler } from './$types';

/** Starts "Connect with…": sends the admin to the provider's sign-in page. */
export const GET: RequestHandler = async ({ params, cookies }) => {
	assertNotDemo();
	const ctx = await requireOrg('admin');
	const def = getIntegration(params.id);
	if (!def?.oauth) error(404, 'Not found');
	const origin = appOrigin();
	const { url, nonce } = startOAuth({ ...def, oauth: def.oauth }, ctx.orgId, ctx.userId, origin);
	cookies.set(stateCookie(def.id), nonce, {
		path: `/api/integrations/${def.id}`,
		httpOnly: true,
		sameSite: 'lax',
		secure: origin.startsWith('https:'),
		maxAge: 600
	});
	redirect(303, url, { external: true });
};
