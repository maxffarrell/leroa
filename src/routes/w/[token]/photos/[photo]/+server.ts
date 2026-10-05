import type { RequestHandler } from './$types';
import { workOrderPhoto } from '#lib/server/services/work-orders.ts';

export const GET: RequestHandler = async ({ params }) => {
	const { doc, data } = await workOrderPhoto(params.token, params.photo);
	return new Response(data as Uint8Array<ArrayBuffer>, {
		headers: {
			'content-type': doc.contentType,
			'content-length': String(doc.size),
			'x-content-type-options': 'nosniff',
			'referrer-policy': 'no-referrer',
			'cache-control': 'private, max-age=3600'
		}
	});
};
