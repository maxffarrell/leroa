import * as v from 'valibot';
import { assertHub, revokeToken } from '#lib/server/profile/hub.ts';
import type { RequestHandler } from './$types';

/** Token revocation (RFC 7009 style: always 200, JSON body). */
export const POST: RequestHandler = async ({ request }) => {
	assertHub();
	const body = v.safeParse(
		v.object({ token: v.pipe(v.string(), v.maxLength(200)) }),
		await request.json().catch(() => null)
	);
	if (body.success) await revokeToken(body.output.token);
	return new Response(null, { status: 200 });
};
