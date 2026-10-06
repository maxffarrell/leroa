import type { PageServerLoad } from './$types';
import { publicListings } from '#lib/server/services/listings.ts';
import { publicProperties } from '#lib/server/services/crm.ts';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const data = await publicListings(params.org);
	const properties = await publicProperties(data.org.id);
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return { ...data, properties };
};
