import type { PageServerLoad } from './$types';
import { getOrg } from '#lib/server/context.ts';
import { publicListing } from '#lib/server/services/listings.ts';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const viewer = await getOrg();
	const data = await publicListing(params.org, params.listing, viewer?.orgId ?? null);
	setHeaders({
		'cache-control': data.preview || viewer ? 'private, no-store' : 'public, max-age=60'
	});
	return data;
};
