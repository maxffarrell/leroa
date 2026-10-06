import { json } from '@sveltejs/kit';
import { assertHub, bearer, profileForToken } from '#lib/server/profile/hub.ts';
import type { RequestHandler } from './$types';

/** The shared profile, limited to what the resident agreed to share with this install. */
export const GET: RequestHandler = async ({ request }) => {
	assertHub();
	const token = bearer(request);
	const result = token ? await profileForToken(token) : null;
	if (!result) {
		return json(
			{ error: 'invalid_token' },
			{ status: 401, headers: { 'www-authenticate': 'Bearer error="invalid_token"' } }
		);
	}
	return json(result, { headers: { 'cache-control': 'no-store' } });
};
