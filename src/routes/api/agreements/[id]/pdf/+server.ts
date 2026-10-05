import type { RequestHandler } from './$types';
import { getOrg, requireUser } from '#lib/server/context.ts';
import { agreementFile } from '#lib/server/services/agreements.ts';

export const GET: RequestHandler = async ({ params, url }) => {
	const { user } = requireUser();
	const ctx = await getOrg();
	const { name, data } = await agreementFile(params.id, {
		orgId: ctx?.orgId ?? null,
		userId: user.id
	});
	const disposition = url.searchParams.has('download') ? 'attachment' : 'inline';
	return new Response(data as Uint8Array<ArrayBuffer>, {
		headers: {
			'content-type': 'application/pdf',
			'content-length': String(data.length),
			'content-disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
			'x-content-type-options': 'nosniff',
			'cache-control': 'private, no-store'
		}
	});
};
