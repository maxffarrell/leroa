import { staffOrgForRecord } from '#lib/server/access.ts';
import type { RequestHandler } from './$types';
import { getOrg } from '#lib/server/context.ts';
import { listingPhoto } from '#lib/server/services/listings.ts';

export const GET: RequestHandler = async ({ params }) => {
	const viewer = await getOrg();
	const {
		doc,
		data,
		public: isPublic
	} = await listingPhoto(
		params.listing,
		params.photo,
		await staffOrgForRecord(viewer, 'listings', 'listings', params.listing)
	);
	return new Response(data as Uint8Array<ArrayBuffer>, {
		headers: {
			'content-type': doc.contentType,
			'content-length': String(doc.size),
			'x-content-type-options': 'nosniff',
			'cache-control': isPublic ? 'public, max-age=86400' : 'private, no-store'
		}
	});
};
