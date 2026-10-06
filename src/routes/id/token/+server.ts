import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { assertHub, exchangeCode, tokenRequest } from '#lib/server/profile/hub.ts';
import type { RequestHandler } from './$types';

/** OAuth token endpoint (JSON body; installs call it server-to-server). */
export const POST: RequestHandler = async ({ request }) => {
	assertHub();
	const body = v.safeParse(tokenRequest, await request.json().catch(() => null));
	if (!body.success) return json({ error: 'invalid_request' }, { status: 400 });
	const token = await exchangeCode(body.output);
	if (!token) return json({ error: 'invalid_grant' }, { status: 400 });
	return json(token, { headers: { 'cache-control': 'no-store' } });
};
