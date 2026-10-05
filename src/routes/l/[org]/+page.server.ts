import type { PageServerLoad } from './$types';
import { publicListings } from '#lib/server/services/listings.ts';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const data = await publicListings(params.org);
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return data;
};
