import type { PageServerLoad } from './$types';
import { validateWorkOrderLink } from '#lib/server/services/work-orders.ts';

export const load: PageServerLoad = async ({ params, setHeaders }) => {
	// The token in the URL is the credential: keep it out of caches and Referer headers.
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	await validateWorkOrderLink(params.token);
};
