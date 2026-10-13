import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { assertHub, exchangeCode, tokenRequest } from '#lib/server/profile/hub.ts';
import type { RequestHandler } from './$types';

/** OAuth token endpoint. Installs call it server-to-server; JSON and form bodies both work. */
export const POST: RequestHandler = async ({ request }) => {
	assertHub();
	const type = request.headers.get('content-type') ?? '';
	const raw: unknown = type.includes('application/x-www-form-urlencoded')
		? Object.fromEntries(new URLSearchParams(await request.text()))
		: await request.json().catch(() => null);
	const body = v.safeParse(tokenRequest, raw);
	if (!body.success) return json({ error: 'invalid_request' }, { status: 400 });
	const token = await exchangeCode(body.output);
	if (!token) return json({ error: 'invalid_grant' }, { status: 400 });
	return json(token, { headers: { 'cache-control': 'no-store' } });
};
